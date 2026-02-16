var SCENARIO_LAB8 = {
  id: 'lab8-rds-deadlock-storm',
  title: 'RDS Deadlock Storm',
  difficulty: 'intermediate',

  alert: {
    severity: 'critical',
    source: 'Datadog Monitor',
    timestamp: '2024-04-19 15:42:18 KST',
    title: '[P1] RDS Deadlock 급증 — DML 처리 지연',
    message: '주문/결제 서비스의 DML 처리량이 급감하고 deadlock 이벤트가 분당 45건 이상 발생 중입니다. 결제 실패율이 23%로 상승했습니다.',
    metric: { name: 'aws.rds.deadlocks', value: '45', unit: '/min', threshold: '5' },
    tags: ['db:order-db-primary', 'env:production', 'severity:p1']
  },

  briefing: {
    description: '금요일 오후 3시 40분, 결제 처리 실패 알림이 연이어 발생하고 있습니다. 주문 서비스와 결제 서비스의 DB 쿼리들이 지연되고 있으며, RDS deadlock 카운터가 급증하고 있습니다. 오늘 오전에 결제 서비스 v2.5.0이 배포되었습니다. 트랜잭션 처리 로직이 변경된 것으로 파악됩니다.',
    environment: {
      services: ['payment-service (Spring Boot)', 'order-service (Spring Boot)', 'RDS Aurora MySQL (order-db)'],
      infra: 'EKS, RDS Aurora MySQL (db.r6g.xlarge), max_connections=200',
      monitoring: 'Datadog RDS Integration + APM'
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
    'step-1': {
      title: 'RDS 대시보드 확인',
      description: 'Datadog RDS 대시보드를 열어 order-db 클러스터의 상태를 확인합니다. deadlocks 메트릭과 DML 레이턴시 차트에서 급격한 변화가 감지됩니다.',
      metrics: [
        {
          title: 'RDS Deadlock 발생 추이',
          chartType: 'line',
          chartConfig: {
            labels: ['15:30', '15:35', '15:40', '15:42', '15:44', '15:46'],
            datasets: [{
              label: 'aws.rds.deadlocks (/min)',
              data: [0.2, 0.3, 12, 45, 48, 46],
              borderColor: '#ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              tension: 0.3,
              fill: true
            }]
          }
        },
        {
          title: 'DML Latency 추이',
          chartType: 'line',
          chartConfig: {
            labels: ['15:30', '15:35', '15:40', '15:42', '15:44', '15:46'],
            datasets: [{
              label: 'aws.rds.dml_latency (ms)',
              data: [5.2, 6.1, 120, 850, 920, 880],
              borderColor: '#f59e0b',
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              tension: 0.3,
              fill: true
            }]
          }
        }
      ],
      logs: [
        { timestamp: '15:42:05', level: 'ERROR', service: 'payment-service', message: '[payment-db-pool] Deadlock found when trying to get lock; try restarting transaction' },
        { timestamp: '15:42:11', level: 'ERROR', service: 'order-service', message: '[order-processor] Lock wait timeout exceeded; try restarting transaction' },
        { timestamp: '15:42:18', level: 'WARN', service: 'rds-order-db', message: '[InnoDB] Deadlock detected, rolling back transaction 0x7f3a2c001f40' },
        { timestamp: '15:42:22', level: 'ERROR', service: 'payment-service', message: '[PaymentController] Payment processing failed: Could not execute statement; SQL [UPDATE payments SET status=? WHERE order_id=?]' },
        { timestamp: '15:42:28', level: 'ERROR', service: 'order-service', message: '[OrderService] Order update failed: Deadlock detected during UPDATE orders SET payment_id=? WHERE id=?' }
      ],
      choices: [
        {
          text: 'SHOW ENGINE INNODB STATUS로 deadlock 상세 분석',
          isOptimal: true,
          feedback: '정확한 판단입니다. InnoDB 엔진 상태를 확인하면 어떤 트랜잭션들이 어떤 순서로 락을 잡으려 했는지 상세 정보를 얻을 수 있습니다.',
          nextStep: 'step-2a'
        },
        {
          text: 'RDS CPU/메모리 사용률 확인',
          isOptimal: false,
          feedback: 'CPU/메모리를 확인하는 것도 중요하지만, deadlock은 리소스 부족이 아닌 lock contention 문제입니다. 다른 각도로 접근해보세요.',
          nextStep: 'step-2b'
        },
        {
          text: 'payment-service Pod 재시작으로 즉시 복구',
          isOptimal: false,
          feedback: 'Pod 재시작은 일시적으로 연결을 초기화할 뿐, 트랜잭션 로직 자체의 문제를 해결하지 못합니다.',
          nextStep: 'step-2c-deadend'
        }
      ],
      hint: 'Deadlock은 두 개 이상의 트랜잭션이 서로가 보유한 락을 기다리며 순환 대기 상태에 빠지는 현상입니다. InnoDB는 deadlock 발생 시 상세 정보를 기록하므로 이를 확인하면 어떤 쿼리들이 충돌했는지 파악할 수 있습니다.'
    },

    'step-2a': {
      title: 'InnoDB Status 분석',
      description: 'SHOW ENGINE INNODB STATUS 출력을 분석한 결과, 두 개의 트랜잭션이 orders와 payments 테이블에 대해 서로 다른 순서로 락을 잡으려 시도하면서 deadlock이 발생하고 있음을 확인했습니다.',
      metrics: [
        {
          title: 'Blocked Transactions',
          chartType: 'bar',
          chartConfig: {
            labels: ['15:30', '15:35', '15:40', '15:42', '15:44', '15:46'],
            datasets: [{
              label: 'aws.rds.blocked_transactions',
              data: [2, 3, 28, 89, 95, 92],
              backgroundColor: '#dc2626'
            }]
          }
        },
        {
          title: 'Row Lock Time 추이',
          chartType: 'line',
          chartConfig: {
            labels: ['15:30', '15:35', '15:40', '15:42', '15:44', '15:46'],
            datasets: [{
              label: 'aws.rds.row_lock_time (ms)',
              data: [12, 15, 180, 1200, 1350, 1280],
              borderColor: '#8b5cf6',
              backgroundColor: 'rgba(139, 92, 246, 0.1)',
              tension: 0.3,
              fill: true
            }]
          }
        }
      ],
      logs: [
        { timestamp: '15:42:30', level: 'INFO', service: 'rds-order-db', message: '*** (1) TRANSACTION:\nTRANSACTION 421857, ACTIVE 0 sec starting index read\nmysql tables in use 1, locked 1\nLOCK WAIT 3 lock struct(s), heap size 1136, 2 row lock(s)\nMySQL thread id 12489, OS thread handle 140734512345088, query id 8234561 10.0.1.45 appuser updating\nUPDATE orders SET payment_id=123, status=\'PAID\' WHERE id=456\n\n*** (1) WAITING FOR THIS LOCK TO BE GRANTED:\nRECORD LOCKS space id 58 page no 3 n bits 72 index PRIMARY of table `order_db`.`orders` trx id 421857 lock_mode X locks rec but not gap waiting' },
        { timestamp: '15:42:30', level: 'INFO', service: 'rds-order-db', message: '*** (2) TRANSACTION:\nTRANSACTION 421856, ACTIVE 0 sec starting index read\nmysql tables in use 1, locked 1\n4 lock struct(s), heap size 1136, 3 row lock(s)\nMySQL thread id 12488, OS thread handle 140734512346112, query id 8234559 10.0.1.44 appuser updating\nUPDATE payments SET status=\'COMPLETED\' WHERE order_id=456\n\n*** (2) HOLDS THE LOCK(S):\nRECORD LOCKS space id 58 page no 3 n bits 72 index PRIMARY of table `order_db`.`orders` trx id 421856 lock_mode X locks rec but not gap\n\n*** (2) WAITING FOR THIS LOCK TO BE GRANTED:\nRECORD LOCKS space id 59 page no 4 n bits 80 index PRIMARY of table `order_db`.`payments` trx id 421856 lock_mode X locks rec but not gap waiting' },
        { timestamp: '15:42:30', level: 'WARN', service: 'rds-order-db', message: '*** WE ROLL BACK TRANSACTION (2)' },
        { timestamp: '15:42:35', level: 'ERROR', service: 'payment-service', message: '[PaymentTxManager] Transaction rolled back due to deadlock: Tx1(orders→payments) vs Tx2(payments→orders)' }
      ],
      choices: [
        {
          text: '최근 배포의 트랜잭션 코드 변경 분석',
          isOptimal: true,
          feedback: '탁월한 판단입니다. Deadlock의 근본 원인은 트랜잭션 간 락 획득 순서 불일치입니다. 최근 배포에서 트랜잭션 로직이 변경되었는지 확인해야 합니다.',
          nextStep: 'step-3a'
        },
        {
          text: 'innodb_lock_wait_timeout 값 증가',
          isOptimal: false,
          feedback: 'Lock wait timeout을 늘리면 대기 시간만 길어질 뿐, 순환 대기 상태 자체는 해결되지 않습니다. 근본 원인을 찾아야 합니다.',
          nextStep: 'step-3b-deadend'
        }
      ],
      hint: 'InnoDB 로그를 보면 Tx1은 orders → payments 순서로, Tx2는 payments → orders 순서로 락을 잡으려 합니다. 이런 순서 불일치가 deadlock의 전형적인 원인입니다. 코드 레벨에서 트랜잭션 순서를 통일해야 합니다.'
    },

    'step-2b': {
      title: 'CPU/메모리 정상 확인',
      description: 'RDS 인스턴스의 CPU 사용률은 45%, 메모리 사용률은 62%로 정상 범위입니다. Deadlock은 리소스 부족이 아닌 트랜잭션 간 lock contention 문제임을 확인했습니다. 다시 deadlock 원인 분석으로 돌아가야 합니다.',
      metrics: [
        {
          title: 'CPU/Memory 사용률',
          chartType: 'line',
          chartConfig: {
            labels: ['15:30', '15:35', '15:40', '15:42', '15:44', '15:46'],
            datasets: [
              {
                label: 'CPU (%)',
                data: [42, 44, 46, 45, 44, 43],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                tension: 0.3,
                fill: true
              },
              {
                label: 'Memory (%)',
                data: [60, 61, 63, 62, 61, 60],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.3,
                fill: true
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '15:43:00', level: 'INFO', service: 'datadog-agent', message: '[rds-monitor] order-db-primary CPU: 45%, Memory: 62%, Disk: 38% — all within normal range' },
        { timestamp: '15:43:05', level: 'INFO', service: 'rds-order-db', message: '[Performance Schema] Active connections: 78/200, QPS: 1250, slow queries: 0' }
      ],
      choices: [
        {
          text: 'InnoDB deadlock 상세 분석으로 돌아가기',
          isOptimal: true,
          feedback: '올바른 판단입니다. 리소스는 정상이므로 deadlock의 근본 원인을 찾기 위해 InnoDB 상태를 분석해야 합니다.',
          nextStep: 'step-2a'
        }
      ],
      hint: 'Deadlock은 CPU나 메모리 부족과는 무관합니다. 두 트랜잭션이 서로 다른 순서로 같은 리소스(테이블 row)에 락을 잡으려 할 때 발생하는 논리적 문제입니다.'
    },

    'step-2c-deadend': {
      title: 'Pod 재시작 — Dead End',
      description: 'payment-service Pod를 재시작했지만, 새로운 요청이 들어오자 곧바로 deadlock이 재발했습니다. Pod 재시작은 DB 연결을 초기화할 뿐, 트랜잭션 로직 자체의 문제를 해결하지 못합니다.',
      isDeadEnd: true,
      metrics: [
        {
          title: 'Pod 재시작 후 Deadlock 재발',
          chartType: 'line',
          chartConfig: {
            labels: ['15:45', '15:46', '15:47', '15:48', '15:49', '15:50'],
            datasets: [{
              label: 'aws.rds.deadlocks (/min) — Pod 재시작 후',
              data: [0, 2, 18, 42, 44, 46],
              borderColor: '#ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              tension: 0.3,
              fill: true
            }]
          }
        }
      ],
      logs: [
        { timestamp: '15:45:10', level: 'INFO', service: 'k8s-controller', message: '[pod-lifecycle] payment-service-7d8f9c-abc12 terminated, new pod payment-service-7d8f9c-xyz89 started' },
        { timestamp: '15:46:30', level: 'ERROR', service: 'payment-service', message: '[payment-db-pool] Deadlock found when trying to get lock; try restarting transaction' },
        { timestamp: '15:47:05', level: 'WARN', service: 'rds-order-db', message: '[InnoDB] Deadlock detected again, rolling back transaction 0x7f3a2c003d20' }
      ],
      learningMoment: {
        title: 'Deadlock은 코드 레벨 문제',
        explanation: 'DB deadlock은 트랜잭션 로직에서 락 획득 순서가 일치하지 않을 때 발생합니다. Pod를 재시작하거나 연결을 끊어도 동일한 트랜잭션 로직이 실행되면 deadlock은 반복됩니다. 근본 원인은 코드에 있으므로, 인프라 조작이 아닌 트랜잭션 순서 분석과 코드 수정이 필요합니다.',
        moduleReference: '모듈 8: RDS Deadlock 및 Slow Query 분석'
      },
      redirectTo: 'step-1',
      redirectMessage: '처음으로 돌아가서 deadlock의 근본 원인을 찾아보세요.'
    },

    'step-3a': {
      title: '코드 변경 분석 — 트랜잭션 순서 불일치 발견',
      description: '오늘 오전 배포된 payment-service v2.5.0의 Git diff를 확인한 결과, 결제 트랜잭션 내에서 테이블 접근 순서가 변경되었습니다. 기존에는 orders → payments 순서였으나, 새 버전에서는 payments → orders 순서로 바뀌었습니다. 이로 인해 order-service(orders→payments)와 payment-service(payments→orders)가 서로 다른 순서로 락을 잡으려 하면서 deadlock이 발생했습니다.',
      metrics: [
        {
          title: 'Active Transactions',
          chartType: 'line',
          chartConfig: {
            labels: ['15:30', '15:35', '15:40', '15:42', '15:44', '15:46'],
            datasets: [{
              label: 'aws.rds.active_transactions',
              data: [45, 48, 120, 180, 185, 182],
              borderColor: '#f59e0b',
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              tension: 0.3,
              fill: true
            }]
          }
        },
        {
          title: 'DML Throughput 비교',
          chartType: 'bar',
          chartConfig: {
            labels: ['v2.4.8 (before)', 'v2.5.0 (after)'],
            datasets: [{
              label: 'aws.rds.dml_throughput (ops/s)',
              data: [850, 320],
              backgroundColor: ['#10b981', '#dc2626']
            }]
          }
        }
      ],
      logs: [
        { timestamp: '15:48:00', level: 'INFO', service: 'git-analysis', message: '[payment-service v2.5.0 diff] PaymentTransactionService.java:87 — Transaction order changed: payments → orders (was: orders → payments)' },
        { timestamp: '15:48:05', level: 'INFO', service: 'git-analysis', message: 'commit a3f7c2d "refactor: optimize payment flow by reducing unnecessary order lock" by dev@company.com' },
        { timestamp: '15:48:10', level: 'WARN', service: 'code-review', message: '[conflict-detected] order-service still uses orders→payments, payment-service now uses payments→orders — deadlock risk!' },
        { timestamp: '15:48:20', level: 'INFO', service: 'apm-trace', message: '[Datadog APM] Trace shows payment-service acquiring payments lock first, then waiting for orders lock held by order-service' }
      ],
      choices: [
        {
          text: '트랜잭션 순서 통일 + 즉시 핫픽스 배포',
          isOptimal: true,
          feedback: '최고의 선택입니다. 모든 서비스가 orders → payments 순서로 락을 획득하도록 통일하면 deadlock 순환 대기가 발생하지 않습니다. 즉시 핫픽스를 배포하여 장애를 해소하세요.',
          nextStep: 'step-4a'
        },
        {
          text: 'SELECT FOR UPDATE NOWAIT로 deadlock 회피',
          isOptimal: false,
          feedback: 'NOWAIT은 대기 없이 즉시 실패하므로 deadlock을 회피할 수 있지만, 재시도 로직이 복잡해지고 근본 원인(순서 불일치)은 해결되지 않습니다. 트랜잭션 순서 통일이 더 근본적인 해결책입니다.',
          nextStep: 'step-4a'
        }
      ],
      hint: 'Deadlock 방지의 황금률: 모든 트랜잭션이 동일한 순서로 리소스(테이블 row)에 락을 획득하도록 통일하면 순환 대기가 발생하지 않습니다. 트랜잭션 설계 시 항상 테이블 접근 순서를 문서화하고 팀 전체가 준수해야 합니다.'
    },

    'step-3b-deadend': {
      title: 'Lock Timeout 증가 — Dead End',
      description: 'innodb_lock_wait_timeout을 50초에서 120초로 늘렸지만, deadlock은 계속 발생하고 있습니다. Timeout을 늘리면 대기 시간만 길어질 뿐, Tx1과 Tx2가 서로를 기다리는 순환 대기 상태 자체는 해결되지 않습니다.',
      isDeadEnd: true,
      metrics: [
        {
          title: 'Timeout 증가 후 Deadlock 지속',
          chartType: 'line',
          chartConfig: {
            labels: ['15:50', '15:52', '15:54', '15:56', '15:58', '16:00'],
            datasets: [{
              label: 'aws.rds.deadlocks (/min) — timeout 증가 후',
              data: [44, 42, 45, 43, 46, 44],
              borderColor: '#ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              tension: 0.3,
              fill: true
            }]
          }
        }
      ],
      logs: [
        { timestamp: '15:50:30', level: 'INFO', service: 'rds-order-db', message: '[parameter-group] innodb_lock_wait_timeout changed from 50 to 120' },
        { timestamp: '15:52:15', level: 'ERROR', service: 'payment-service', message: '[payment-db-pool] Deadlock found when trying to get lock; try restarting transaction (waited 0.8s, timeout is 120s)' },
        { timestamp: '15:54:22', level: 'WARN', service: 'rds-order-db', message: '[InnoDB] Deadlock detected, rolling back transaction — timeout setting irrelevant to deadlock detection' }
      ],
      learningMoment: {
        title: 'Deadlock ≠ Lock Wait Timeout',
        explanation: 'Lock wait timeout은 한 트랜잭션이 다른 트랜잭션의 락을 기다릴 수 있는 최대 시간입니다. 하지만 deadlock은 두 트랜잭션이 서로를 기다리는 순환 대기 상태이므로, timeout과는 무관하게 InnoDB가 즉시 감지하고 하나를 롤백합니다. Timeout을 늘려도 deadlock 자체는 해결되지 않으며, 트랜잭션 순서를 통일해야 합니다.',
        moduleReference: '모듈 8: RDS Deadlock 및 Slow Query 분석'
      },
      redirectTo: 'step-2a',
      redirectMessage: 'InnoDB 분석으로 돌아가서 트랜잭션 순서 불일치를 해결하세요.'
    },

    'step-4a': {
      title: '핫픽스 배포 — Deadlock 해소',
      description: 'payment-service v2.5.1 핫픽스를 배포하여 트랜잭션 순서를 orders → payments로 되돌렸습니다. 모든 서비스가 동일한 순서로 락을 획득하도록 통일되면서 deadlock이 완전히 사라졌습니다. DML 레이턴시도 정상으로 복구되었습니다.',
      metrics: [
        {
          title: 'Deadlock 해소',
          chartType: 'line',
          chartConfig: {
            labels: ['16:10', '16:12', '16:14', '16:16', '16:18', '16:20'],
            datasets: [{
              label: 'aws.rds.deadlocks (/min)',
              data: [42, 35, 18, 4, 0.5, 0.2],
              borderColor: '#10b981',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              tension: 0.3,
              fill: true
            }]
          }
        },
        {
          title: 'DML Latency 복구',
          chartType: 'line',
          chartConfig: {
            labels: ['16:10', '16:12', '16:14', '16:16', '16:18', '16:20'],
            datasets: [{
              label: 'aws.rds.dml_latency (ms)',
              data: [820, 450, 180, 35, 9, 6],
              borderColor: '#10b981',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              tension: 0.3,
              fill: true
            }]
          }
        }
      ],
      logs: [
        { timestamp: '16:15:00', level: 'INFO', service: 'k8s-controller', message: '[rollout] payment-service v2.5.1 deployed — transaction order reverted to orders→payments' },
        { timestamp: '16:16:30', level: 'INFO', service: 'payment-service', message: '[PaymentTxManager] All transactions now follow orders→payments lock sequence' },
        { timestamp: '16:18:00', level: 'INFO', service: 'datadog-monitor', message: '[rds-order-db] Deadlock count dropped to 0.2/min (normal level)' },
        { timestamp: '16:19:00', level: 'INFO', service: 'apm-trace', message: '[Datadog APM] DML latency p95: 6ms (recovered from 850ms)' },
        { timestamp: '16:20:00', level: 'INFO', service: 'order-service', message: '[OrderProcessor] Payment success rate: 99.8% (recovered from 77%)' }
      ],
      choices: [
        {
          text: '재발 방지 대책 수립 및 사후 분석',
          isOptimal: true,
          feedback: '완벽합니다. 장애를 복구했으니 이제 재발 방지를 위한 장기 대책을 수립하고 팀 전체와 공유해야 합니다.',
          nextStep: 'step-final'
        }
      ],
      hint: '트랜잭션 순서 통일은 deadlock 방지의 핵심입니다. 이를 코드 리뷰와 CI 테스트에 반영하면 미래의 deadlock을 예방할 수 있습니다.'
    },

    'step-final': {
      title: '사후 분석 및 재발 방지',
      description: '장애가 완전히 복구되었습니다. 근본 원인은 payment-service v2.5.0 배포 시 트랜잭션 내 테이블 접근 순서가 변경되면서 order-service와 lock 순서 충돌이 발생한 것입니다. 재발 방지를 위해 트랜잭션 가이드라인을 수립하고, CI에 deadlock 시뮬레이션 테스트를 추가하며, RDS deadlock 모니터를 강화했습니다.',
      isTerminal: true,
      rootCause: {
        title: 'RDS Deadlock Storm',
        summary: 'payment-service v2.5.0 배포 시 트랜잭션 내 테이블 접근 순서가 payments→orders로 변경되면서, 기존 order-service(orders→payments)와 lock 순서 충돌이 발생하여 deadlock 폭증',
        timeline: [
          { time: '09:30', event: 'payment-service v2.5.0 배포 — 트랜잭션 순서 변경 (orders→payments에서 payments→orders로)' },
          { time: '15:30', event: '주말 트래픽 증가 시작, 동시 트랜잭션 수 증가' },
          { time: '15:40', event: 'RDS deadlock 급증 (0.2 → 45/min), DML 레이턴시 급등 (5ms → 850ms)' },
          { time: '15:42', event: 'Datadog P1 알림 발생, 결제 실패율 23% 상승' },
          { time: '15:45', event: 'SHOW ENGINE INNODB STATUS로 deadlock 상세 분석 시작' },
          { time: '15:48', event: 'Git diff 분석으로 트랜잭션 순서 변경 발견' },
          { time: '16:15', event: 'payment-service v2.5.1 핫픽스 배포 (트랜잭션 순서 통일)' },
          { time: '16:20', event: 'Deadlock 해소 확인, DML 레이턴시 정상 복구 (6ms)' }
        ],
        resolution: [
          '즉시 핫픽스: payment-service v2.5.1 배포하여 트랜잭션 순서를 orders→payments로 통일',
          '트랜잭션 가이드라인: 모든 서비스가 orders → payments → ... 순서로 락 획득하도록 문서화',
          'CI 테스트: 동시 트랜잭션 deadlock 시뮬레이션 테스트 추가 (JMeter + MySQL)',
          '코드 리뷰: 트랜잭션 순서 변경 시 필수 리뷰 체크리스트 항목 추가',
          'RDS 모니터링: aws.rds.deadlocks 임계값을 5/min로 설정, Slack 알림 연동',
          '배포 프로세스: 트랜잭션 변경 시 canary 배포 + 30분 모니터링 후 전체 롤아웃'
        ]
      },
      postMortem: {
        template: {
          fields: [
            {
              label: 'Deadlock 발생 시 가장 먼저 확인해야 할 명령어는?',
              type: 'text',
              placeholder: 'SHOW ENGINE INNODB STATUS',
              hint: 'InnoDB 엔진의 deadlock 상세 정보를 확인하는 명령어'
            },
            {
              label: 'Deadlock이 발생하는 근본 원인은? (간단히 설명)',
              type: 'textarea',
              placeholder: '두 개 이상의 트랜잭션이 서로 다른 순서로 같은 리소스에 락을 잡으려 하면서 순환 대기 상태에 빠지는 것',
              hint: '트랜잭션 간 lock 순서 불일치가 핵심'
            },
            {
              label: 'Deadlock 방지를 위한 가장 효과적인 방법은?',
              type: 'choice',
              options: [
                'innodb_lock_wait_timeout 값 증가',
                '모든 트랜잭션이 동일한 순서로 테이블에 락 획득',
                'Pod 재시작',
                'RDS 인스턴스 스케일업'
              ],
              correctAnswer: 1,
              hint: '트랜잭션 순서 통일이 근본 해결책'
            },
            {
              label: '이번 장애에서 배운 핵심 교훈 3가지를 작성하세요.',
              type: 'textarea',
              placeholder: '1. 트랜잭션 순서 변경은 deadlock 리스크\n2. InnoDB Status로 lock contention 분석\n3. CI 테스트로 사전 검증',
              hint: '코드 리뷰, 테스트, 모니터링 관점에서 생각해보세요'
            }
          ]
        }
      }
    }
  }
};
