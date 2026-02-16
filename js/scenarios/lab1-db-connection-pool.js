/**
 * Lab 1: DB Connection Pool 고갈 장애 시나리오
 *
 * 상황: 금요일 오후 2시, user-service의 p99 레이턴시가 5초 이상으로 급등.
 * 근본 원인: 마케팅팀의 배치 쿼리가 커넥션을 장시간 점유하여 HikariCP 풀 고갈.
 */
var SCENARIO_LAB1 = {
  id: 'lab1-db-connection-pool',
  title: 'DB Connection Pool 고갈 장애',
  difficulty: 'intermediate',

  alert: {
    severity: 'critical',
    source: 'Datadog Monitor',
    timestamp: '2024-03-15 14:12:34 KST',
    title: '[P1] user-service p99 레이턴시 임계값 초과',
    message: 'user-service의 p99 응답 시간이 5,234ms로 급등했습니다. 임계값(500ms)을 크게 초과하고 있으며, 5xx 에러율이 동시에 급증하고 있습니다.',
    metric: {
      name: 'trace.spring.request.duration.p99',
      value: '5,234',
      unit: 'ms',
      threshold: '500'
    },
    tags: ['service:user-service', 'env:production', 'region:ap-northeast-2', 'severity:p1']
  },

  briefing: {
    description: '금요일 오후 2시경, PagerDuty에서 P1 알림이 발생했습니다. user-service의 응답 시간이 갑자기 치솟고 있으며, 프론트엔드에서 사용자들의 로그인 및 프로필 조회 실패 보고가 들어오고 있습니다. 당신은 온콜 엔지니어로서 이 장애를 조사해야 합니다.',
    environment: {
      services: ['user-service (Spring Boot)', 'order-service', 'payment-service', 'api-gateway (Kong)'],
      infra: 'EKS (3 nodes), RDS MySQL (db.r6g.xlarge, max_connections=200), ElastiCache Redis',
      monitoring: 'Datadog APM + RDS Integration + Kubernetes Integration'
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
    // Step 1: 초기 알림 확인 - API 레이턴시 및 5xx 차트
    // ============================================================
    'step-1': {
      title: '초기 알림 확인',
      description: 'Datadog APM 대시보드에서 user-service의 상태를 확인합니다. p99 레이턴시가 14:05부터 급격히 상승하고 있으며, 동시에 5xx 에러가 폭증하고 있습니다.',
      metrics: [
        {
          title: 'user-service p99 Latency (ms)',
          chartType: 'line',
          chartConfig: {
            labels: ['14:00', '14:05', '14:10', '14:15', '14:20', '14:25'],
            datasets: [{
              label: 'p99 Latency (ms)',
              data: [180, 195, 210, 850, 3200, 5234],
              borderColor: '#f87171',
              backgroundColor: 'rgba(248, 113, 113, 0.1)',
              fill: true,
              tension: 0.3
            }, {
              label: 'p50 Latency (ms)',
              data: [45, 48, 52, 320, 1800, 3500],
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
            labels: ['14:00', '14:05', '14:10', '14:15', '14:20', '14:25'],
            datasets: [{
              label: '5xx Errors',
              data: [0, 0, 1, 12, 87, 156],
              backgroundColor: 'rgba(239, 68, 68, 0.6)',
              borderColor: '#ef4444',
              borderWidth: 1
            }]
          }
        }
      ],
      logs: [
        { timestamp: '14:12:34', level: 'ERROR', source: 'user-service', message: 'o.s.w.s.m.s.DefaultHandlerExceptionResolver - Resolved [org.springframework.web.context.request.async.AsyncRequestTimeoutException]' },
        { timestamp: '14:12:31', level: 'ERROR', source: 'user-service', message: 'c.z.h.p.HikariPool - HikariPool-1 - Connection is not available, request timed out after 30000ms.' },
        { timestamp: '14:12:28', level: 'WARN', source: 'user-service', message: 'c.z.h.p.HikariPool - HikariPool-1 - Pool stats (total=50, active=50, idle=0, waiting=127)' },
        { timestamp: '14:12:22', level: 'ERROR', source: 'api-gateway', message: 'upstream timed out (110: Connection timed out) while reading response header from upstream [user-service:8080]' },
        { timestamp: '14:12:15', level: 'WARN', source: 'user-service', message: 'c.z.h.p.HikariPool - HikariPool-1 - Pool stats (total=50, active=50, idle=0, waiting=98)' }
      ],
      hint: 'HikariPool 로그를 자세히 보세요. active=50이면 모든 커넥션이 사용 중이라는 의미입니다. 왜 커넥션이 반환되지 않을까요? DB 측 지표를 확인해보면 단서를 찾을 수 있습니다.',
      choices: [
        {
          text: 'RDS 메트릭 확인 (DatabaseConnections, CPU, Performance Insights)',
          isOptimal: true,
          feedback: '정확한 판단입니다! HikariPool에서 커넥션 고갈이 발생하고 있으므로, DB 측에서 커넥션이 어떻게 사용되고 있는지 확인하는 것이 핵심입니다.',
          nextStep: 'step-2a'
        },
        {
          text: 'Kubernetes Pod 상태 확인 (kubectl get pods)',
          isOptimal: false,
          feedback: '커넥션 풀 고갈은 Pod 수준의 문제가 아닙니다. 로그에서 HikariPool 타임아웃이 보이므로 DB 쪽을 먼저 확인하는 것이 효율적입니다.',
          nextStep: 'step-2b'
        },
        {
          text: '최근 배포 이력 확인 (ArgoCD / deployment history)',
          isOptimal: false,
          feedback: '배포 이력을 확인하는 것도 합리적이지만, 이미 HikariPool 타임아웃 로그가 명확히 보이고 있어 DB 커넥션 문제에 집중하는 것이 더 효율적입니다.',
          nextStep: 'step-2c'
        }
      ]
    },

    // ============================================================
    // Step 2a: RDS 대시보드 확인 (최적 경로)
    // ============================================================
    'step-2a': {
      title: 'RDS 메트릭 분석',
      description: 'CloudWatch에서 RDS 인스턴스(user-db-primary)의 지표를 확인합니다. DatabaseConnections가 최대값(200)에 도달했으며, CPU 사용률도 비정상적으로 높아진 것을 확인할 수 있습니다.',
      metrics: [
        {
          title: 'RDS DatabaseConnections (vs Max 200)',
          chartType: 'line',
          chartConfig: {
            labels: ['14:00', '14:05', '14:10', '14:15', '14:20', '14:25'],
            datasets: [{
              label: 'Active Connections',
              data: [45, 48, 52, 120, 195, 200],
              borderColor: '#f97316',
              backgroundColor: 'rgba(249, 115, 22, 0.1)',
              fill: true,
              tension: 0.3
            }, {
              label: 'Max Connections (200)',
              data: [200, 200, 200, 200, 200, 200],
              borderColor: '#ef4444',
              borderDash: [8, 4],
              borderWidth: 1,
              pointRadius: 0,
              fill: false
            }]
          }
        },
        {
          title: 'RDS CPU Utilization (%)',
          chartType: 'line',
          chartConfig: {
            labels: ['14:00', '14:05', '14:10', '14:15', '14:20', '14:25'],
            datasets: [{
              label: 'CPU %',
              data: [35, 38, 42, 55, 68, 72],
              borderColor: '#a78bfa',
              backgroundColor: 'rgba(167, 139, 250, 0.1)',
              fill: true,
              tension: 0.3
            }]
          }
        }
      ],
      logs: [
        { timestamp: '14:12:40', level: 'ERROR', source: 'user-service', message: 'o.s.j.s.JdbcTemplate - Could not get JDBC Connection; nested exception is org.springframework.jdbc.CannotGetJdbcConnectionException' },
        { timestamp: '14:12:38', level: 'WARN', source: 'user-service', message: 'c.z.h.p.HikariPool - HikariPool-1 - Pool stats (total=50, active=50, idle=0, waiting=142)' },
        { timestamp: '14:12:35', level: 'INFO', source: 'rds-monitor', message: 'DatabaseConnections: 200/200 (MAXIMUM REACHED) - user-db-primary.cluster-abc123.ap-northeast-2.rds.amazonaws.com' },
        { timestamp: '14:12:30', level: 'WARN', source: 'rds-monitor', message: 'Performance Insights: Top SQL detected - query running for 847 seconds, holding 150 connections' },
        { timestamp: '14:10:15', level: 'INFO', source: 'rds-monitor', message: 'New connection burst detected: +68 connections in 5 minutes from IP 10.0.3.42 (batch-worker-pod)' }
      ],
      hint: 'Performance Insights에서 장시간 실행 중인 쿼리가 감지되었습니다. 150개 커넥션을 점유하고 있는 쿼리가 무엇인지 확인해야 합니다. batch-worker-pod에서 대량 커넥션이 생성된 것도 단서입니다.',
      choices: [
        {
          text: 'Performance Insights에서 활성 쿼리 분석 + HikariCP 설정 확인',
          isOptimal: true,
          feedback: '정확합니다! 어떤 쿼리가 커넥션을 장시간 점유하고 있는지 확인하는 것이 근본 원인을 찾는 핵심 단계입니다.',
          nextStep: 'step-3a'
        },
        {
          text: 'RDS 인스턴스를 더 큰 타입으로 스케일업 (db.r6g.2xlarge)',
          isOptimal: false,
          isDeadEnd: true,
          feedback: '스케일업은 근본 원인을 해결하지 못합니다. 커넥션이 반환되지 않는 문제이므로 인스턴스를 키워도 커넥션 풀은 여전히 고갈됩니다.',
          nextStep: 'step-3b-deadend'
        },
        {
          text: 'user-service Pod 수를 늘려서 처리량 확대 (HPA 수동 스케일)',
          isOptimal: false,
          isDeadEnd: true,
          feedback: 'Pod를 늘리면 각 Pod가 자체 커넥션 풀을 생성하므로 DB 커넥션 수가 더 늘어나 상황이 악화됩니다!',
          nextStep: 'step-3c-deadend'
        }
      ]
    },

    // ============================================================
    // Step 2b: K8s Pod 확인 (비최적 - 리다이렉트)
    // ============================================================
    'step-2b': {
      title: 'Kubernetes Pod 상태 확인',
      description: 'kubectl로 user-service Pod 상태를 확인합니다. 모든 Pod가 Running 상태이며, CPU/메모리도 정상 범위입니다. Pod 수준에서는 특이사항이 없습니다.',
      logs: [
        { timestamp: '14:13:00', level: 'INFO', source: 'kubectl', message: 'NAME                            READY   STATUS    RESTARTS   AGE' },
        { timestamp: '14:13:00', level: 'INFO', source: 'kubectl', message: 'user-service-6d8f9b7c4-abc12   1/1     Running   0          3d' },
        { timestamp: '14:13:00', level: 'INFO', source: 'kubectl', message: 'user-service-6d8f9b7c4-def34   1/1     Running   0          3d' },
        { timestamp: '14:13:00', level: 'INFO', source: 'kubectl', message: 'user-service-6d8f9b7c4-ghi56   1/1     Running   0          3d' },
        { timestamp: '14:13:01', level: 'INFO', source: 'kubectl', message: 'CPU: 45% avg, Memory: 62% avg - 모든 Pod 정상 범위' },
        { timestamp: '14:13:02', level: 'WARN', source: 'kubectl', message: 'Pod 로그에서 HikariPool 타임아웃 반복 확인 - DB 커넥션 문제로 추정됨' }
      ],
      choices: [
        {
          text: '이전 단계로 돌아가서 다른 방향으로 조사',
          isOptimal: true,
          feedback: 'Pod는 정상입니다. 로그에서 HikariPool 타임아웃이 보이므로, DB 커넥션 쪽을 조사해야 합니다.',
          nextStep: 'step-1'
        }
      ]
    },

    // ============================================================
    // Step 2c: 배포 이력 확인 (비최적 - 리다이렉트)
    // ============================================================
    'step-2c': {
      title: '배포 이력 확인',
      description: 'ArgoCD와 CI/CD 파이프라인을 확인합니다. user-service는 최근 2일간 배포가 없었습니다. 다만 batch-worker 서비스가 오늘 오전에 새 버전이 배포된 것을 확인했습니다.',
      logs: [
        { timestamp: '14:13:15', level: 'INFO', source: 'argocd', message: 'user-service: last deployment 2024-03-13 10:25:00 (v2.14.3) - 2일 전' },
        { timestamp: '14:13:15', level: 'INFO', source: 'argocd', message: 'batch-worker: last deployment 2024-03-15 09:30:00 (v1.8.0) - 오늘 오전' },
        { timestamp: '14:13:15', level: 'INFO', source: 'argocd', message: 'order-service: last deployment 2024-03-14 16:00:00 (v3.2.1) - 어제' },
        { timestamp: '14:13:16', level: 'INFO', source: 'gitlab-ci', message: 'batch-worker v1.8.0 변경사항: "마케팅 분석용 사용자-주문 조인 배치 쿼리 추가"' }
      ],
      choices: [
        {
          text: '이전 단계로 돌아가서 DB 지표를 확인',
          isOptimal: true,
          feedback: 'batch-worker의 배포가 의심되지만, 먼저 DB 커넥션 상태를 직접 확인하는 것이 더 빠른 진단 경로입니다.',
          nextStep: 'step-1'
        }
      ]
    },

    // ============================================================
    // Step 3a: Performance Insights 쿼리 분석 (최적 경로)
    // ============================================================
    'step-3a': {
      title: 'Performance Insights 쿼리 분석',
      description: 'RDS Performance Insights에서 현재 실행 중인 쿼리를 분석합니다. 847초 동안 실행 중인 대형 JOIN 쿼리가 발견되었습니다. batch-worker Pod에서 실행된 마케팅 분석 쿼리로, users 테이블과 orders 테이블을 FULL JOIN하여 약 5천만 행을 스캔하고 있습니다.',
      metrics: [
        {
          title: 'Top SQL by Wait Time',
          chartType: 'bar',
          chartConfig: {
            labels: ['SELECT users JOIN orders...', 'SELECT * FROM users WHERE...', 'INSERT INTO user_sessions...', 'UPDATE users SET last_login...'],
            datasets: [{
              label: 'Wait Time (sec)',
              data: [847, 28, 3, 1],
              backgroundColor: ['rgba(239, 68, 68, 0.7)', 'rgba(251, 191, 36, 0.5)', 'rgba(99, 102, 241, 0.4)', 'rgba(99, 102, 241, 0.3)'],
              borderColor: ['#ef4444', '#fbbf24', '#6366f1', '#6366f1'],
              borderWidth: 1
            }]
          }
        },
        {
          title: 'Connection Distribution by Source',
          chartType: 'doughnut',
          chartConfig: {
            labels: ['batch-worker (마케팅 쿼리)', 'user-service Pod 1', 'user-service Pod 2', 'user-service Pod 3', 'monitoring'],
            datasets: [{
              data: [150, 17, 17, 16, 0],
              backgroundColor: [
                'rgba(239, 68, 68, 0.7)',
                'rgba(99, 102, 241, 0.5)',
                'rgba(99, 102, 241, 0.4)',
                'rgba(99, 102, 241, 0.3)',
                'rgba(107, 114, 128, 0.3)'
              ],
              borderColor: '#1f2937',
              borderWidth: 2
            }]
          }
        }
      ],
      logs: [
        { timestamp: '14:14:00', level: 'ERROR', source: 'performance-insights', message: 'Top Query (847s running): SELECT u.*, o.order_id, o.total_amount, o.created_at FROM users u JOIN orders o ON u.id = o.user_id WHERE o.created_at >= "2024-01-01" -- scanning ~50M rows' },
        { timestamp: '14:14:00', level: 'WARN', source: 'performance-insights', message: 'Query source: batch-worker-pod (10.0.3.42), user: batch_analytics, connections held: 150' },
        { timestamp: '14:14:00', level: 'INFO', source: 'performance-insights', message: 'Table scan: users (2M rows) x orders (25M rows) = ~50M row join, no covering index detected' },
        { timestamp: '14:14:01', level: 'INFO', source: 'hikaricp', message: 'user-service HikariCP config: maximumPoolSize=50, connectionTimeout=30000ms, maxLifetime=1800000ms' },
        { timestamp: '14:14:01', level: 'WARN', source: 'hikaricp', message: 'batch-worker HikariCP config: maximumPoolSize=150, connectionTimeout=60000ms - 풀 사이즈가 과도하게 큼' }
      ],
      hint: '배치 쿼리가 150개 커넥션을 점유하고 있어 user-service가 사용할 커넥션이 부족합니다. 먼저 이 쿼리를 중단(KILL)하고, 재발 방지를 위한 statement_timeout 설정이 필요합니다.',
      choices: [
        {
          text: '장시간 실행 쿼리 KILL + statement_timeout 설정으로 즉시 대응',
          isOptimal: true,
          feedback: '정확합니다! 문제 쿼리를 즉시 종료하여 커넥션을 해제하고, 향후 이런 쿼리가 커넥션을 장시간 점유하지 못하도록 타임아웃을 설정하는 것이 올바른 긴급 대응입니다.',
          nextStep: 'step-4a'
        },
        {
          text: 'HikariCP maximumPoolSize를 50 → 100으로 증가',
          isOptimal: false,
          feedback: '풀 사이즈를 늘려도 batch-worker가 이미 150개 커넥션을 점유 중이므로 근본적인 해결이 되지 않습니다. 게다가 RDS max_connections(200)에 이미 도달한 상태입니다. 먼저 문제 쿼리를 종료해야 합니다.',
          nextStep: 'step-3a'
        }
      ]
    },

    // ============================================================
    // Step 3b: Dead End - RDS 스케일업
    // ============================================================
    'step-3b-deadend': {
      title: '막다른 길: RDS 스케일업',
      isDeadEnd: true,
      description: 'RDS 인스턴스를 db.r6g.2xlarge로 스케일업을 시도합니다. 하지만 스케일업에는 재시작이 필요하여 다운타임이 발생하며, 스케일업이 완료되어도 커넥션 풀 고갈 문제는 해결되지 않습니다.',
      learningMoment: {
        title: '스케일업이 해결책이 아닌 이유',
        explanation: '이 장애의 근본 원인은 CPU나 메모리 부족이 아니라, 하나의 쿼리가 150개 커넥션을 장시간 점유하고 있는 것입니다. 인스턴스를 키워도 max_connections가 약간 늘어날 뿐, 배치 쿼리가 커넥션을 반환하지 않는 문제는 동일합니다. 또한 RDS 스케일업은 재시작이 필요하므로, 장애 중에 추가 다운타임을 유발합니다.',
        moduleReference: 'Module 3: AWS RDS 메트릭에서 스케일업 vs 스케일아웃 전략을 복습하세요.'
      },
      redirectTo: 'step-2a',
      redirectMessage: 'RDS 대시보드로 돌아가서 다시 분석'
    },

    // ============================================================
    // Step 3c: Dead End - Pod 스케일아웃
    // ============================================================
    'step-3c-deadend': {
      title: '막다른 길: Pod 스케일아웃',
      isDeadEnd: true,
      description: 'user-service Pod를 3개에서 6개로 증가시켰습니다. 하지만 각 Pod가 자체 HikariCP 풀(maximumPoolSize=50)을 생성하므로, 총 필요 커넥션이 150 → 300으로 늘어났습니다. RDS max_connections(200)을 초과하여 새 Pod들이 아예 DB에 연결하지 못하고, 상황이 더 악화되었습니다.',
      learningMoment: {
        title: 'Pod 스케일아웃과 커넥션 풀의 관계',
        explanation: '각 애플리케이션 Pod는 독립적인 커넥션 풀을 유지합니다. Pod가 N개이고 각 풀이 M개 커넥션을 가지면, 최대 N x M개의 DB 커넥션이 필요합니다. Pod를 늘리면 DB 커넥션 수요가 비례하여 증가하므로, 커넥션 풀 고갈 상황에서 Pod 스케일아웃은 오히려 역효과를 낳습니다. 이 경우 PgBouncer나 ProxySQL 같은 커넥션 풀러(Connection Pooler)를 도입하거나, 근본 원인(장시간 쿼리)을 해결해야 합니다.',
        moduleReference: 'Module 4: Kubernetes 모니터링에서 HPA와 리소스 관계를 복습하세요.'
      },
      redirectTo: 'step-2a',
      redirectMessage: 'RDS 대시보드로 돌아가서 다시 분석'
    },

    // ============================================================
    // Step 4a: 쿼리 KILL + 즉시 대응 (최적 경로)
    // ============================================================
    'step-4a': {
      title: '긴급 대응: 쿼리 종료 및 커넥션 복구',
      description: '문제 쿼리를 KILL하여 커넥션을 즉시 해제합니다. 쿼리 종료 후 커넥션이 정상적으로 반환되기 시작하며, user-service의 응답 시간이 빠르게 회복됩니다.',
      metrics: [
        {
          title: 'DatabaseConnections (쿼리 KILL 후)',
          chartType: 'line',
          chartConfig: {
            labels: ['14:20', '14:22', '14:24', '14:26', '14:28', '14:30'],
            datasets: [{
              label: 'Active Connections',
              data: [200, 200, 85, 52, 48, 46],
              borderColor: '#4ade80',
              backgroundColor: 'rgba(74, 222, 128, 0.1)',
              fill: true,
              tension: 0.3
            }, {
              label: 'Max Connections (200)',
              data: [200, 200, 200, 200, 200, 200],
              borderColor: '#ef4444',
              borderDash: [8, 4],
              borderWidth: 1,
              pointRadius: 0,
              fill: false
            }]
          }
        },
        {
          title: 'user-service p99 Latency 복구',
          chartType: 'line',
          chartConfig: {
            labels: ['14:20', '14:22', '14:24', '14:26', '14:28', '14:30'],
            datasets: [{
              label: 'p99 Latency (ms)',
              data: [5234, 4800, 850, 210, 185, 178],
              borderColor: '#4ade80',
              backgroundColor: 'rgba(74, 222, 128, 0.1)',
              fill: true,
              tension: 0.3
            }]
          }
        }
      ],
      logs: [
        { timestamp: '14:23:00', level: 'INFO', source: 'mysql', message: 'CALL mysql.rds_kill(12847); -- 배치 쿼리 프로세스 종료' },
        { timestamp: '14:23:01', level: 'INFO', source: 'mysql', message: 'SET GLOBAL max_execution_time = 300000; -- 5분 statement_timeout 설정' },
        { timestamp: '14:23:05', level: 'INFO', source: 'rds-monitor', message: 'DatabaseConnections: 85/200 - 커넥션 해제 진행 중' },
        { timestamp: '14:24:00', level: 'INFO', source: 'user-service', message: 'c.z.h.p.HikariPool - HikariPool-1 - Pool stats (total=50, active=12, idle=38, waiting=0) - 정상 복구' },
        { timestamp: '14:25:00', level: 'INFO', source: 'datadog', message: 'user-service p99 latency recovered: 185ms (threshold: 500ms)' }
      ],
      hint: '즉시 대응은 완료되었습니다. 이제 재발 방지를 위한 항구적 대책을 수립해야 합니다. 배치 쿼리를 안전하게 실행할 수 있는 환경을 만들어야 합니다.',
      choices: [
        {
          text: '재발 방지: Read Replica 분리 + 배치 전용 커넥션 풀 + 모니터링 강화',
          isOptimal: true,
          feedback: '완벽한 판단입니다! 배치 쿼리는 Read Replica에서 실행하도록 분리하고, 커넥션 풀 사용률 모니터링을 추가하여 재발을 방지합니다.',
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
        title: 'HikariCP Connection Pool 고갈 (마케팅 배치 쿼리)',
        summary: '마케팅팀의 배치 분석 쿼리(users JOIN orders, ~5천만 행 스캔)가 Primary DB에서 실행되면서 150개 커넥션을 847초간 점유했습니다. 이로 인해 RDS max_connections(200)에 도달하여 user-service의 HikariCP 풀이 커넥션을 얻지 못해 타임아웃이 발생했습니다.',
        timeline: [
          { time: '09:30', event: 'batch-worker v1.8.0 배포 (마케팅 분석 쿼리 추가)' },
          { time: '14:00', event: 'batch-worker 크론잡 시작, 대형 JOIN 쿼리 실행 시작' },
          { time: '14:05', event: 'DB 커넥션 수 급증 시작 (45 -> 120)' },
          { time: '14:10', event: 'DatabaseConnections 200/200 도달, user-service 커넥션 타임아웃 시작' },
          { time: '14:12', event: 'P1 알림 발생: user-service p99 > 5,000ms' },
          { time: '14:13', event: '온콜 엔지니어 대응 시작' },
          { time: '14:23', event: '문제 쿼리 KILL, statement_timeout 설정' },
          { time: '14:26', event: '서비스 정상 복구 확인' }
        ],
        resolution: [
          '즉시 대응: 문제 쿼리 KILL + max_execution_time 설정',
          '단기 대책: batch-worker의 DB 엔드포인트를 Read Replica로 변경',
          '중기 대책: 배치 전용 커넥션 풀 분리 (maximumPoolSize=10, statement_timeout=300s)',
          '장기 대책: ProxySQL 도입으로 커넥션 관리 일원화, 쿼리 분류별 라우팅',
          '모니터링: DatabaseConnections > 80% 경고 알림 추가, HikariPool waiting > 10 알림 추가'
        ]
      },
      postMortem: {
        template: {
          fields: [
            {
              label: '1. 장애 요약 (한 줄)',
              placeholder: '예: 마케팅 배치 쿼리로 인한 DB 커넥션 풀 고갈로 user-service 장애 발생'
            },
            {
              label: '2. 영향 범위',
              placeholder: '예: user-service 전체 (로그인, 프로필 조회, 사용자 검색), 약 13분간 서비스 장애'
            },
            {
              label: '3. 탐지 방법과 개선점',
              placeholder: '예: Datadog p99 알림으로 탐지. 개선: DB 커넥션 풀 사용률 알림을 추가하여 더 빠른 탐지 가능'
            },
            {
              label: '4. 근본 원인',
              placeholder: '예: batch-worker가 Primary DB에서 대형 JOIN 쿼리를 실행하여 max_connections 도달'
            },
            {
              label: '5. 재발 방지 계획',
              placeholder: '예: Read Replica 분리, statement_timeout 설정, 커넥션 풀 모니터링 강화'
            }
          ]
        }
      }
    }
  }
};
