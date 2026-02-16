/**
 * Lab 2: Slow Query CPU 포화 장애 시나리오
 *
 * 상황: 화요일 오전 10시, order-service의 주문 목록 API 응답이 점점 느려지더니 전체 서비스로 전파.
 * 근본 원인: 개발자가 배포한 새 API에서 orders 테이블에 인덱스 없이 created_at 범위 쿼리 실행 → full table scan → RDS CPU 90%+ → 모든 쿼리 지연.
 */
var SCENARIO_LAB2 = {
  id: 'lab2-slow-query-cpu',
  title: 'Slow Query CPU 포화 장애',
  difficulty: 'intermediate',

  alert: {
    severity: 'critical',
    source: 'Datadog Monitor',
    timestamp: '2024-04-09 10:18:22 KST',
    title: '[P1] order-service p99 레이턴시 급증 및 5xx 에러율 상승',
    message: 'order-service의 p99 응답 시간이 8,450ms로 급등했습니다. 임계값(800ms)을 크게 초과하고 있으며, 5xx 에러율이 15%까지 상승하고 있습니다.',
    metric: {
      name: 'trace.spring.request.duration.p99',
      value: '8,450',
      unit: 'ms',
      threshold: '800'
    },
    tags: ['service:order-service', 'env:production', 'region:ap-northeast-2', 'severity:p1']
  },

  briefing: {
    description: '화요일 오전 10시, PagerDuty에서 P1 알림이 발생했습니다. order-service의 주문 목록 API(/api/orders)가 점점 느려지면서 프론트엔드에서 타임아웃이 발생하고 있습니다. 고객센터에서도 주문 조회 실패 문의가 들어오고 있습니다. 당신은 온콜 엔지니어로서 신속하게 원인을 파악하고 복구해야 합니다.',
    environment: {
      services: ['order-service (Spring Boot)', 'user-service', 'payment-service', 'api-gateway (Kong)'],
      infra: 'EKS (4 nodes), RDS MySQL (db.r6g.xlarge, 4 vCPU, max_connections=200), ElastiCache Redis',
      monitoring: 'Datadog APM + RDS Performance Insights + CloudWatch'
    }
  },

  optimalPath: ['step-1', 'step-2a', 'step-3a', 'step-4a', 'step-final'],

  scoring: {
    gradeThresholds: {
      S: { maxExtraSteps: 0, maxHints: 0, label: 'Senior SRE' },
      A: { maxExtraSteps: 2, maxHints: 1, label: 'Proficient' },
      B: { maxExtraSteps: 4, maxHints: 2, label: 'Developing' },
      C: { maxExtraSteps: Infinity, maxHints: Infinity, label: 'Learning' }
    }
  },

  steps: {
    // ============================================================
    // Step 1: 초기 알림 확인 - API 레이턴시 및 에러 차트
    // ============================================================
    'step-1': {
      title: '초기 알림 확인',
      description: 'Datadog APM 대시보드에서 order-service의 상태를 확인합니다. p99 레이턴시가 10:05부터 급격히 상승하고 있으며, 5xx 에러가 동시에 증가하고 있습니다. 애플리케이션 로그에서 slow query warning이 반복적으로 출력되고 있습니다.',
      metrics: [
        {
          title: 'order-service p99/p50 Latency (ms)',
          chartType: 'line',
          chartConfig: {
            labels: ['10:00', '10:05', '10:10', '10:15', '10:20', '10:25'],
            datasets: [{
              label: 'p99 Latency (ms)',
              data: [320, 450, 1250, 3800, 6500, 8450],
              borderColor: '#f87171',
              backgroundColor: 'rgba(248, 113, 113, 0.1)',
              fill: true,
              tension: 0.3
            }, {
              label: 'p50 Latency (ms)',
              data: [85, 120, 580, 1900, 3200, 4500],
              borderColor: '#fbbf24',
              backgroundColor: 'rgba(251, 191, 36, 0.05)',
              fill: false,
              tension: 0.3,
              borderDash: [5, 5]
            }]
          }
        },
        {
          title: '5xx Errors (/min)',
          chartType: 'bar',
          chartConfig: {
            labels: ['10:00', '10:05', '10:10', '10:15', '10:20', '10:25'],
            datasets: [{
              label: '5xx Errors',
              data: [0, 2, 18, 65, 142, 198],
              backgroundColor: 'rgba(239, 68, 68, 0.6)',
              borderColor: '#ef4444',
              borderWidth: 1
            }]
          }
        }
      ],
      logs: [
        { timestamp: '10:18:22', level: 'ERROR', source: 'order-service', message: 'o.s.w.s.m.s.DefaultHandlerExceptionResolver - Resolved [org.springframework.web.client.ResourceAccessException: I/O error on GET request for "/api/orders"]' },
        { timestamp: '10:18:18', level: 'WARN', source: 'order-service', message: 'o.h.e.j.s.SqlExceptionHelper - SQL Warning Code: 1681, SQLState: 01000 - Query execution was interrupted, maximum statement execution time exceeded' },
        { timestamp: '10:18:15', level: 'WARN', source: 'order-service', message: 'o.h.e.j.s.SqlExceptionHelper - SQL Warning: Query took 12.3 seconds: SELECT * FROM orders WHERE created_at >= ? AND created_at <= ? ORDER BY created_at DESC' },
        { timestamp: '10:18:10', level: 'ERROR', source: 'api-gateway', message: 'upstream timed out (110: Connection timed out) while reading response header from upstream [order-service:8080]' },
        { timestamp: '10:18:05', level: 'WARN', source: 'order-service', message: 'o.h.e.j.s.SqlExceptionHelper - SQL Warning: Query took 9.8 seconds: SELECT * FROM orders WHERE created_at >= ? AND created_at <= ?' }
      ],
      hint: '로그에서 slow query warning이 반복 출력되고 있습니다. 특정 쿼리가 10초 이상 걸리고 있다는 것은 DB 측에 문제가 있다는 신호입니다. RDS Performance Insights를 확인하면 어떤 쿼리가 CPU를 점유하고 있는지 알 수 있습니다.',
      choices: [
        {
          text: 'RDS Performance Insights 확인 (CPU, Top SQL, Wait Events)',
          isOptimal: true,
          feedback: '정확한 판단입니다! Slow query warning이 반복되고 있으므로, DB 측에서 어떤 쿼리가 CPU를 소모하고 있는지 확인하는 것이 핵심입니다.',
          nextStep: 'step-2a'
        },
        {
          text: '최근 배포 이력 확인 (ArgoCD / deployment history)',
          isOptimal: false,
          feedback: '배포 이력을 확인하는 것도 합리적이지만, 이미 slow query 로그가 명확히 보이고 있어 DB 쿼리 문제에 집중하는 것이 더 효율적입니다.',
          nextStep: 'step-2b'
        },
        {
          text: 'order-service Pod 리소스 확인 (CPU/Memory/Disk)',
          isOptimal: false,
          feedback: 'Pod 리소스보다는 DB 쿼리가 문제입니다. 로그에서 쿼리 실행 시간이 10초 이상 걸린다는 명확한 증거가 있으므로 RDS를 먼저 확인해야 합니다.',
          nextStep: 'step-2c'
        }
      ]
    },

    // ============================================================
    // Step 2a: RDS Performance Insights 확인 (최적 경로)
    // ============================================================
    'step-2a': {
      title: 'RDS Performance Insights 분석',
      description: 'RDS Performance Insights 대시보드를 확인합니다. CPU 사용률이 90%를 넘어서고 있으며, Top SQL에서 orders 테이블의 범위 쿼리가 압도적인 CPU 시간을 소비하고 있습니다. EXPLAIN 분석 결과 full table scan이 발생하고 있음을 확인했습니다.',
      metrics: [
        {
          title: 'RDS CPU Utilization (%)',
          chartType: 'line',
          chartConfig: {
            labels: ['10:00', '10:05', '10:10', '10:15', '10:20', '10:25'],
            datasets: [{
              label: 'CPU %',
              data: [28, 42, 68, 85, 92, 95],
              borderColor: '#f87171',
              backgroundColor: 'rgba(248, 113, 113, 0.1)',
              fill: true,
              tension: 0.3
            }, {
              label: 'Warning Threshold (80%)',
              data: [80, 80, 80, 80, 80, 80],
              borderColor: '#fbbf24',
              borderDash: [8, 4],
              borderWidth: 1,
              pointRadius: 0,
              fill: false
            }]
          }
        },
        {
          title: 'Top SQL by DB Load (AAS)',
          chartType: 'bar',
          chartConfig: {
            labels: ['SELECT orders WHERE created_at...', 'SELECT * FROM orders WHERE id...', 'UPDATE orders SET status...', 'INSERT INTO order_items...'],
            datasets: [{
              label: 'Average Active Sessions',
              data: [3.8, 0.2, 0.1, 0.05],
              backgroundColor: ['rgba(239, 68, 68, 0.7)', 'rgba(99, 102, 241, 0.5)', 'rgba(99, 102, 241, 0.4)', 'rgba(99, 102, 241, 0.3)'],
              borderColor: ['#ef4444', '#6366f1', '#6366f1', '#6366f1'],
              borderWidth: 1
            }]
          }
        }
      ],
      logs: [
        { timestamp: '10:19:00', level: 'ERROR', source: 'performance-insights', message: 'Top SQL (95% CPU load): SELECT * FROM orders WHERE created_at >= "2024-01-01" AND created_at <= "2024-04-09" ORDER BY created_at DESC LIMIT 50' },
        { timestamp: '10:19:00', level: 'WARN', source: 'performance-insights', message: 'Query execution: type=ALL, rows_examined=25,487,320, Using filesort - FULL TABLE SCAN detected' },
        { timestamp: '10:19:01', level: 'INFO', source: 'performance-insights', message: 'Wait Event: CPU - 95%, io/table/sql/handler - 5%' },
        { timestamp: '10:19:01', level: 'WARN', source: 'performance-insights', message: 'Table: orders (25.4M rows, 18.3 GB), Index: PRIMARY (id), MISSING INDEX on created_at column' },
        { timestamp: '10:19:02', level: 'INFO', source: 'rds-monitor', message: 'DatabaseConnections: 87/200, ReadIOPS: 1,250, WriteIOPS: 45' }
      ],
      hint: 'EXPLAIN 결과에서 type=ALL이 나타났습니다. 이는 인덱스를 사용하지 않고 전체 테이블을 스캔한다는 의미입니다. created_at 컬럼에 인덱스가 없어서 2,500만 행을 모두 읽어야 하므로 CPU가 포화 상태입니다.',
      choices: [
        {
          text: '쿼리 EXPLAIN 분석 + 인덱스 확인',
          isOptimal: true,
          feedback: '정확합니다! EXPLAIN 결과를 상세히 분석하고 missing index를 확인하는 것이 근본 원인 파악의 핵심입니다.',
          nextStep: 'step-3a'
        },
        {
          text: 'RDS 인스턴스 타입 업그레이드 (db.r6g.2xlarge)',
          isOptimal: false,
          isDeadEnd: true,
          feedback: '스케일업은 근본 원인을 해결하지 못합니다. 인덱스 없는 full table scan 문제이므로 인스턴스를 키워도 CPU 부하는 계속됩니다.',
          nextStep: 'step-3b-deadend'
        }
      ]
    },

    // ============================================================
    // Step 2b: 최근 배포 확인 (비최적 - 리다이렉트)
    // ============================================================
    'step-2b': {
      title: '배포 이력 확인',
      description: 'ArgoCD와 CI/CD 파이프라인을 확인합니다. order-service v3.8.0이 오늘 오전 9시 30분에 배포되었습니다. 릴리스 노트를 보니 "주문 목록 필터링 API 개선" 항목이 있습니다.',
      logs: [
        { timestamp: '10:19:30', level: 'INFO', source: 'argocd', message: 'order-service: last deployment 2024-04-09 09:30:00 (v3.8.0) - 50분 전' },
        { timestamp: '10:19:30', level: 'INFO', source: 'argocd', message: 'user-service: last deployment 2024-04-08 14:00:00 (v2.15.1) - 어제' },
        { timestamp: '10:19:30', level: 'INFO', source: 'gitlab-ci', message: 'order-service v3.8.0 변경사항: "주문 목록 필터링 API 개선 - created_at 범위 조회 기능 추가"' },
        { timestamp: '10:19:31', level: 'WARN', source: 'gitlab-ci', message: 'Code review: DB 인덱스 검증 단계 SKIPPED (urgent release)' }
      ],
      choices: [
        {
          text: '이전 단계로 돌아가서 RDS 지표 확인',
          isOptimal: true,
          feedback: '새 배포에서 created_at 범위 조회 기능이 추가되었다는 단서를 얻었습니다. 이제 DB 측에서 이 쿼리가 어떻게 실행되는지 확인해야 합니다.',
          nextStep: 'step-1'
        }
      ]
    },

    // ============================================================
    // Step 2c: Pod 리소스 확인 (비최적 - 리다이렉트)
    // ============================================================
    'step-2c': {
      title: 'Kubernetes Pod 리소스 확인',
      description: 'kubectl로 order-service Pod 상태를 확인합니다. 모든 Pod가 Running 상태이며, CPU/메모리도 정상 범위입니다. Pod 수준에서는 특이사항이 없습니다.',
      logs: [
        { timestamp: '10:20:00', level: 'INFO', source: 'kubectl', message: 'NAME                             READY   STATUS    RESTARTS   AGE' },
        { timestamp: '10:20:00', level: 'INFO', source: 'kubectl', message: 'order-service-7f9d8c6b5-aaa11   1/1     Running   0          4d' },
        { timestamp: '10:20:00', level: 'INFO', source: 'kubectl', message: 'order-service-7f9d8c6b5-bbb22   1/1     Running   0          4d' },
        { timestamp: '10:20:00', level: 'INFO', source: 'kubectl', message: 'order-service-7f9d8c6b5-ccc33   1/1     Running   0          4d' },
        { timestamp: '10:20:01', level: 'INFO', source: 'kubectl', message: 'CPU: 38% avg, Memory: 55% avg - 모든 Pod 정상 범위' },
        { timestamp: '10:20:02', level: 'WARN', source: 'kubectl', message: 'Pod 로그에서 slow query warning 반복 확인 - DB 쿼리 문제로 추정됨' }
      ],
      choices: [
        {
          text: '이전 단계로 돌아가서 다른 방향으로 조사',
          isOptimal: true,
          feedback: 'Pod는 정상입니다. 로그에서 slow query warning이 보이므로, RDS Performance Insights를 확인해야 합니다.',
          nextStep: 'step-1'
        }
      ]
    },

    // ============================================================
    // Step 3a: EXPLAIN 분석 + 인덱스 확인 (최적 경로)
    // ============================================================
    'step-3a': {
      title: 'EXPLAIN 결과 분석 및 인덱스 확인',
      description: 'EXPLAIN 명령으로 문제 쿼리를 분석한 결과, type: ALL (full table scan), rows: 25,487,320, Extra: Using filesort가 확인되었습니다. orders 테이블에 created_at 컬럼 인덱스가 존재하지 않아 모든 행을 스캔하고 있습니다.',
      metrics: [
        {
          title: 'Query Execution Plan',
          chartType: 'bar',
          chartConfig: {
            labels: ['Rows Examined', 'Rows Sent', 'Index Used'],
            datasets: [{
              label: 'Count',
              data: [25487320, 50, 0],
              backgroundColor: ['rgba(239, 68, 68, 0.7)', 'rgba(74, 222, 128, 0.5)', 'rgba(251, 191, 36, 0.5)'],
              borderColor: ['#ef4444', '#4ade80', '#fbbf24'],
              borderWidth: 1
            }]
          }
        }
      ],
      logs: [
        { timestamp: '10:21:00', level: 'ERROR', source: 'mysql', message: 'EXPLAIN SELECT * FROM orders WHERE created_at >= "2024-01-01" AND created_at <= "2024-04-09" ORDER BY created_at DESC LIMIT 50;' },
        { timestamp: '10:21:00', level: 'ERROR', source: 'mysql', message: '+----+-------------+--------+------+---------------+------+---------+------+----------+-----------------------------+' },
        { timestamp: '10:21:00', level: 'ERROR', source: 'mysql', message: '| id | select_type | table  | type | possible_keys | key  | key_len | ref  | rows     | Extra                       |' },
        { timestamp: '10:21:00', level: 'ERROR', source: 'mysql', message: '+----+-------------+--------+------+---------------+------+---------+------+----------+-----------------------------+' },
        { timestamp: '10:21:00', level: 'ERROR', source: 'mysql', message: '|  1 | SIMPLE      | orders | ALL  | NULL          | NULL | NULL    | NULL | 25487320 | Using where; Using filesort |' },
        { timestamp: '10:21:00', level: 'ERROR', source: 'mysql', message: '+----+-------------+--------+------+---------------+------+---------+------+----------+-----------------------------+' },
        { timestamp: '10:21:01', level: 'WARN', source: 'mysql', message: 'SHOW INDEX FROM orders; -- Indexes: PRIMARY (id), idx_user_id (user_id), idx_status (status) - MISSING: created_at' },
        { timestamp: '10:21:02', level: 'INFO', source: 'mysql', message: 'Table size: orders - 25,487,320 rows, 18.3 GB data, 4.2 GB index' }
      ],
      hint: 'type: ALL은 인덱스를 전혀 사용하지 않는다는 의미입니다. created_at에 인덱스를 생성하면 full scan 없이 효율적으로 조회할 수 있습니다. 하지만 2,500만 행 테이블에 인덱스를 생성하는 동안 테이블이 잠길 수 있으므로, 먼저 느린 쿼리를 KILL하고 인덱스를 생성해야 합니다.',
      choices: [
        {
          text: '슬로우 쿼리 kill + 문제 API 배포 롤백 (v3.7.x)',
          isOptimal: true,
          feedback: '정확합니다! 먼저 실행 중인 느린 쿼리를 종료하여 CPU를 해제하고, 배포 롤백으로 새로운 슬로우 쿼리 유입을 차단하는 것이 올바른 긴급 대응입니다. CPU 95% 상태에서 인덱스를 바로 생성하면 I/O 부하로 장애가 악화될 수 있습니다.',
          nextStep: 'step-4a'
        },
        {
          text: '운영 중 긴급 인덱스 생성 (CREATE INDEX ALGORITHM=INPLACE)',
          isOptimal: false,
          feedback: 'CPU가 95%인 상태에서 2,500만 행 테이블에 인덱스를 생성하면 I/O와 CPU 부하가 추가됩니다. ALGORITHM=INPLACE라도 대규모 테이블에서는 상당한 리소스를 소모하므로, 먼저 쿼리 kill + 롤백으로 안정화한 후에 인덱스를 생성해야 합니다.',
          nextStep: 'step-3c-deadend'
        },
        {
          text: '쿼리 캐시 활성화 (query_cache_type=1)',
          isOptimal: false,
          feedback: 'MySQL 8.0부터 쿼리 캐시 기능이 완전히 제거되었습니다. 게다가 범위 조회는 매번 조건이 달라지므로 캐시 효과도 제한적입니다.',
          nextStep: 'step-3c-deadend'
        }
      ]
    },

    // ============================================================
    // Step 3b: Dead End - RDS 스케일업
    // ============================================================
    'step-3b-deadend': {
      title: '막다른 길: RDS 스케일업',
      isDeadEnd: true,
      description: 'RDS 인스턴스를 db.r6g.2xlarge(8 vCPU)로 스케일업을 시도합니다. 하지만 스케일업에는 재시작이 필요하여 추가 다운타임이 발생하며, 스케일업 완료 후에도 full table scan 문제는 해결되지 않아 CPU는 여전히 높은 수준을 유지합니다.',
      learningMoment: {
        title: '스케일업이 해결책이 아닌 이유',
        explanation: '이 장애의 근본 원인은 CPU 부족이 아니라 비효율적인 쿼리(full table scan)입니다. 인덱스 없이 2,500만 행을 스캔하는 쿼리는 CPU 코어가 몇 개든 상관없이 과도한 리소스를 소모합니다. 게다가 RDS 스케일업은 재시작이 필요하므로, 장애 중에 추가 다운타임을 유발합니다. 올바른 해결책은 missing index를 생성하여 쿼리 효율을 개선하는 것입니다.',
        moduleReference: 'Module 3: AWS RDS 메트릭에서 스케일업 vs 쿼리 최적화 전략을 복습하세요.'
      },
      redirectTo: 'step-2a',
      redirectMessage: 'RDS Performance Insights로 돌아가서 다시 분석'
    },

    // ============================================================
    // Step 3c: Dead End - 쿼리 캐시
    // ============================================================
    'step-3c-deadend': {
      title: '막다른 길: 장애 중 인덱스 생성 / 쿼리 캐시',
      isDeadEnd: true,
      description: 'CPU 95% 상태에서 2,500만 행 테이블에 인덱스를 생성하거나 쿼리 캐시를 활성화하려는 시도는 올바른 접근이 아닙니다.',
      learningMoment: {
        title: 'ALGORITHM=INPLACE, LOCK=NONE의 올바른 사용 시점',
        explanation: 'MySQL Online DDL(ALGORITHM=INPLACE, LOCK=NONE)은 테이블 잠금 없이 인덱스를 생성할 수 있는 강력한 기능입니다. 하지만 "잠금이 없다"와 "부하가 없다"는 다른 의미입니다. 2,500만 행 테이블에서 인덱스 생성 시: (1) 전체 테이블 데이터를 읽어 인덱스 트리를 구성하므로 ReadIOPS가 크게 증가하고, (2) 인덱스 파일 기록으로 WriteIOPS도 상승하며, (3) CPU 사용량이 추가로 올라갑니다. CPU가 이미 95%인 상태에서 이 작업을 수행하면 디스크 I/O 경합과 CPU 포화로 전체 DB 성능이 추가 악화됩니다. 올바른 순서는: (1) 슬로우 쿼리 kill, (2) 배포 롤백으로 안정화, (3) CPU가 정상(30% 이하)일 때 ALGORITHM=INPLACE로 인덱스 생성, (4) 인덱스 포함 재배포입니다. 참고로 MySQL 8.0부터 쿼리 캐시는 완전히 제거되었습니다.',
        moduleReference: 'Module 3: AWS RDS 메트릭에서 Online DDL과 운영 중 스키마 변경 전략을 복습하세요.'
      },
      redirectTo: 'step-3a',
      redirectMessage: 'EXPLAIN 분석으로 돌아가기'
    },

    // ============================================================
    // Step 4a: 인덱스 생성 + 쿼리 kill (최적 경로)
    // ============================================================
    'step-4a': {
      title: '긴급 대응: 슬로우 쿼리 종료 + 배포 롤백',
      description: '먼저 실행 중인 느린 쿼리들을 KILL하여 CPU를 즉시 해제합니다. 그 다음 ArgoCD에서 order-service를 v3.7.x로 롤백하여 문제 API의 새로운 슬로우 쿼리 유입을 차단합니다. CPU가 안정화된 후, created_at 인덱스를 생성하고 인덱스가 포함된 v3.8.1을 재배포합니다.',
      metrics: [
        {
          title: 'RDS CPU (쿼리 kill + 롤백 후)',
          chartType: 'line',
          chartConfig: {
            labels: ['10:20', '10:22', '10:24', '10:26', '10:28', '10:30'],
            datasets: [{
              label: 'CPU %',
              data: [95, 72, 38, 25, 20, 18],
              borderColor: '#4ade80',
              backgroundColor: 'rgba(74, 222, 128, 0.1)',
              fill: true,
              tension: 0.3
            }]
          }
        },
        {
          title: 'order-service p99 Latency 복구',
          chartType: 'line',
          chartConfig: {
            labels: ['10:20', '10:22', '10:24', '10:26', '10:28', '10:30'],
            datasets: [{
              label: 'p99 Latency (ms)',
              data: [8450, 4200, 680, 340, 310, 285],
              borderColor: '#4ade80',
              backgroundColor: 'rgba(74, 222, 128, 0.1)',
              fill: true,
              tension: 0.3
            }]
          }
        }
      ],
      logs: [
        { timestamp: '10:23:00', level: 'INFO', source: 'mysql', message: 'CALL mysql.rds_kill_query(1847); -- Slow query process killed' },
        { timestamp: '10:23:01', level: 'INFO', source: 'mysql', message: 'CALL mysql.rds_kill_query(1849); -- Slow query process killed' },
        { timestamp: '10:23:02', level: 'INFO', source: 'mysql', message: 'CALL mysql.rds_kill_query(1851); -- Slow query process killed' },
        { timestamp: '10:23:30', level: 'INFO', source: 'argocd', message: 'Rollback initiated: order-service v3.8.0 → v3.7.5' },
        { timestamp: '10:24:15', level: 'INFO', source: 'argocd', message: 'Rollback complete: order-service v3.7.5 (3 pods healthy)' },
        { timestamp: '10:24:30', level: 'INFO', source: 'datadog', message: 'RDS CPU stabilized: 38% (문제 API 제거됨)' },
        { timestamp: '10:26:00', level: 'INFO', source: 'mysql', message: 'CREATE INDEX idx_created_at ON orders(created_at) ALGORITHM=INPLACE, LOCK=NONE; -- CPU 안정화 후 인덱스 생성' },
        { timestamp: '10:29:35', level: 'INFO', source: 'mysql', message: 'Index creation completed: idx_created_at (3m 35s, 0 downtime)' },
        { timestamp: '10:30:00', level: 'INFO', source: 'datadog', message: 'order-service p99 latency stable: 285ms (v3.7.5 정상 운영 중)' }
      ],
      hint: '즉시 대응(kill + 롤백)이 완료되어 서비스가 안정화되었습니다. 인덱스도 생성 완료했으므로, 이제 인덱스를 포함한 v3.8.1을 재배포하고 재발 방지 대책을 수립해야 합니다.',
      choices: [
        {
          text: '인덱스 포함 재배포 (v3.8.1) + 재발 방지: CI/CD EXPLAIN 검증 추가',
          isOptimal: true,
          feedback: '완벽한 판단입니다! 인덱스를 포함한 수정 버전을 재배포하고, CI/CD에 EXPLAIN 검증을 추가하여 재발을 방지합니다.',
          nextStep: 'step-final'
        }
      ]
    },

    // ============================================================
    // Step Final: 근본 원인 및 Post-mortem
    // ============================================================
    'step-final': {
      title: '조사 완료',
      isTerminal: true,
      rootCause: {
        title: 'Slow Query CPU 포화 (Missing Index on created_at)',
        summary: '개발자가 배포한 order-service v3.8.0에서 주문 목록 필터링 기능을 추가하면서, orders 테이블의 created_at 컬럼에 인덱스 없이 범위 쿼리를 실행했습니다. 2,500만 행에 대한 full table scan이 발생하여 RDS CPU가 95%까지 상승했고, 모든 쿼리가 지연되면서 전체 order-service가 장애 상태에 빠졌습니다.',
        timeline: [
          { time: '09:30', event: 'order-service v3.8.0 배포 (created_at 범위 조회 기능 추가)' },
          { time: '10:00', event: '첫 주문 목록 조회 요청 - full table scan 시작' },
          { time: '10:05', event: 'RDS CPU 42% → 68% 급증, 응답 시간 증가' },
          { time: '10:15', event: 'RDS CPU 85% 도달, p99 latency 3,800ms' },
          { time: '10:18', event: 'P1 알림 발생: order-service p99 > 8,000ms' },
          { time: '10:19', event: '온콜 엔지니어 대응 시작' },
          { time: '10:23', event: 'Slow query kill + 인덱스 생성 시작' },
          { time: '10:27', event: '인덱스 생성 완료, 쿼리 성능 개선 확인' },
          { time: '10:28', event: '서비스 정상 복구 확인' }
        ],
        resolution: [
          '즉시 대응: Slow query KILL → 배포 롤백 (v3.7.5) → CPU 안정화 확인',
          '안정화 후: CPU 정상 상태에서 CREATE INDEX ALGORITHM=INPLACE 실행',
          '재배포: 인덱스 포함 v3.8.1 배포 + 성능 검증',
          '단기 대책: slow_query_log_file 활성화, long_query_time=2초 설정',
          '중기 대책: CI/CD 파이프라인에 EXPLAIN 검증 단계 추가 (type=ALL 차단)',
          '장기 대책: pt-query-digest로 주간 슬로우 쿼리 리포트 자동화',
          '모니터링: RDS CPU > 80% 경고 알림, Performance Insights Top SQL 대시보드 추가, slow query count > 10/min 알림'
        ]
      },
      postMortem: {
        template: {
          fields: [
            {
              label: '1. 장애 요약 (한 줄)',
              placeholder: '예: orders 테이블 missing index로 인한 full table scan → RDS CPU 포화 → order-service 장애'
            },
            {
              label: '2. 영향 범위',
              placeholder: '예: order-service 전체 (주문 조회, 주문 목록, 주문 상세), 약 10분간 서비스 지연 및 타임아웃'
            },
            {
              label: '3. 탐지 방법과 개선점',
              placeholder: '예: Datadog p99 알림으로 탐지. 개선: slow query 알림과 RDS CPU 알림을 추가하여 더 빠른 탐지 가능'
            },
            {
              label: '4. 근본 원인',
              placeholder: '예: created_at 범위 쿼리 실행 시 인덱스 부재로 2,500만 행 full scan 발생 → CPU 95%'
            },
            {
              label: '5. 재발 방지 계획',
              placeholder: '예: CI/CD에 EXPLAIN 검증 추가, slow query 모니터링 강화, 코드 리뷰에서 DB 쿼리 성능 체크리스트 추가'
            }
          ]
        }
      }
    }
  }
};
