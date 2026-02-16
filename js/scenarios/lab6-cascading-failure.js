/**
 * Lab 6: 카스케이딩 장애 조사 시나리오
 *
 * 외부 결제 게이트웨이 장애가 서킷 브레이커 부재로 인해
 * 주문 → 재고 → 알림 → API 게이트웨이로 전파되는 카스케이딩 장애 시나리오
 */
var SCENARIO_LAB6 = {
  title: '카스케이딩 장애 조사',
  difficulty: 'advanced',
  estimatedMinutes: 30,
  prerequisiteModules: [1, 5],
  tags: ['cascading-failure', 'circuit-breaker', 'bulkhead', 'timeout', 'resilience'],

  alert: {
    severity: 'critical',
    source: 'Datadog Multi-Service Monitor',
    title: '다중 서비스 동시 장애 발생',
    message: 'order-service, inventory-service, notification-service, api-gateway에서 에러율이 급격히 상승하고 있습니다. 평균 응답시간이 SLO 임계값을 크게 초과했으며, 다수의 요청이 타임아웃되고 있습니다.',
    timestamp: '2024-03-15 10:47:00 KST',
    tags: ['env:production', 'region:ap-northeast-2', 'team:platform', 'severity:p1'],
    metric: {
      name: '전체 서비스 평균 에러율',
      value: '62.3',
      unit: '%',
      threshold: '5'
    }
  },

  briefing: {
    description: '금요일 오전 10시 47분, PagerDuty에서 P1 알림이 발생했습니다. 주문 서비스(order-service)를 시작으로 재고 서비스(inventory-service), 알림 서비스(notification-service), API 게이트웨이까지 연쇄적으로 에러율이 급등하고 있습니다. 고객들이 결제 실패와 페이지 로딩 지연을 보고하고 있으며, CS 팀에 문의가 폭주하고 있습니다. 마이크로서비스 간 의존 관계를 파악하고 장애의 근본 원인을 찾아야 합니다.',
    environment: {
      services: ['api-gateway', 'order-service', 'inventory-service', 'notification-service', 'payment-gateway (외부)'],
      infra: 'Kubernetes (EKS) / 3 nodes / Istio service mesh',
      monitoring: 'Datadog APM + Distributed Tracing + Log Analytics'
    }
  },

  steps: {
    // ──────────────────────────────────────────────
    // Step 1: 초기 알림 확인 및 첫 번째 판단
    // ──────────────────────────────────────────────
    'step-1': {
      id: 'step-1',
      title: '다중 서비스 장애 알림 확인',
      description: 'Datadog 대시보드에 접속하니 4개 서비스에서 동시에 에러율이 급등하고 있습니다. order-service가 가장 먼저, 가장 높은 에러율을 보이며, 이후 inventory-service, notification-service, api-gateway 순서로 영향이 퍼지고 있습니다. 각 서비스의 응답 시간도 비정상적으로 높아지고 있습니다.',
      metrics: [
        {
          title: '서비스별 에러율 (%)',
          chartType: 'line',
          chartConfig: {
            labels: ['10:00', '10:10', '10:20', '10:25', '10:30', '10:35', '10:40', '10:47'],
            datasets: [
              {
                label: 'order-service',
                data: [0.2, 0.3, 0.5, 5.1, 25.4, 45.8, 62.1, 78.3],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239,68,68,0.1)',
                fill: true
              },
              {
                label: 'inventory-service',
                data: [0.1, 0.1, 0.2, 0.8, 8.2, 20.5, 35.7, 55.2],
                borderColor: '#f97316',
                backgroundColor: 'rgba(249,115,22,0.1)',
                fill: true
              },
              {
                label: 'notification-service',
                data: [0.1, 0.1, 0.1, 0.3, 2.1, 12.4, 28.6, 42.1],
                borderColor: '#eab308',
                backgroundColor: 'rgba(234,179,8,0.1)',
                fill: true
              },
              {
                label: 'api-gateway',
                data: [0.3, 0.3, 0.4, 1.2, 10.5, 30.2, 45.6, 60.8],
                borderColor: '#a855f7',
                backgroundColor: 'rgba(168,85,247,0.1)',
                fill: true
              }
            ]
          }
        },
        {
          title: '서비스별 P99 응답시간 (ms)',
          chartType: 'line',
          chartConfig: {
            labels: ['10:00', '10:10', '10:20', '10:25', '10:30', '10:35', '10:40', '10:47'],
            datasets: [
              {
                label: 'payment-gateway',
                data: [200, 250, 1500, 15000, 30000, 30000, 30000, 30000],
                borderColor: '#ef4444',
                borderWidth: 3
              },
              {
                label: 'order-service',
                data: [150, 180, 1800, 16000, 30500, 30500, 30500, 30500],
                borderColor: '#f97316',
                borderWidth: 2
              },
              {
                label: 'inventory-service',
                data: [100, 120, 200, 1600, 16200, 30800, 31000, 31000],
                borderColor: '#eab308',
                borderWidth: 2
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '10:25:14', level: 'WARN', source: 'order-service', message: 'Slow response from payment-gateway: 15023ms (threshold: 3000ms)' },
        { timestamp: '10:30:02', level: 'ERROR', source: 'order-service', message: 'java.net.SocketTimeoutException: Connect timed out to payment-gateway:443' },
        { timestamp: '10:32:18', level: 'ERROR', source: 'inventory-service', message: 'Upstream order-service returned HTTP 503: Service Unavailable' },
        { timestamp: '10:35:41', level: 'ERROR', source: 'api-gateway', message: 'Multiple backend services unhealthy. Active healthy endpoints: 1/4' },
        { timestamp: '10:38:55', level: 'WARN', source: 'notification-service', message: 'Message queue backlog exceeding threshold: 12,847 pending messages' },
        { timestamp: '10:42:10', level: 'ERROR', source: 'order-service', message: 'ThreadPoolExhausted: active=200/200, queue=1200, rejected=847' }
      ],
      choices: [
        {
          text: '서비스 의존성 맵과 분산 트레이싱을 확인한다',
          feedback: '좋은 선택입니다! 다중 서비스 장애 시 의존성 맵과 분산 트레이싱으로 장애 전파 경로를 추적하는 것이 최선입니다.',
          isOptimal: true,
          nextStep: 'step-2a'
        },
        {
          text: '모든 서비스 Pod을 재시작한다 (kubectl rollout restart)',
          feedback: '모든 Pod을 한꺼번에 재시작하면 일시적으로 트래픽 처리가 불가능해지고, 근본 원인을 파악하지 못한 채 동일한 문제가 반복될 수 있습니다.',
          isDeadEnd: true,
          nextStep: 'step-2-deadend-restart'
        },
        {
          text: '데이터베이스 상태를 먼저 확인한다',
          feedback: '데이터베이스 문제일 가능성도 있지만, 로그에서 payment-gateway 타임아웃이 먼저 보이므로 의존성 추적이 더 효율적입니다.',
          nextStep: 'step-2b'
        }
      ],
      hint: '여러 서비스가 동시에 장애가 발생할 때는, 서비스 간 호출 관계를 먼저 파악하는 것이 핵심입니다. Datadog APM의 Service Map이나 분산 트레이싱을 활용해보세요.'
    },

    // ──────────────────────────────────────────────
    // Step 2a: 분산 트레이싱 확인 (최적 경로)
    // ──────────────────────────────────────────────
    'step-2a': {
      id: 'step-2a',
      title: '분산 트레이싱 분석',
      description: 'Datadog APM에서 에러가 발생한 트레이스를 열어보니, order-service가 payment-gateway로 HTTP 호출을 보내고 있으며 응답 대기 시간이 30초(타임아웃 한계)에 달합니다. payment-gateway가 503 상태 코드를 반환하거나 아예 응답하지 않는 경우가 대부분입니다. order-service의 모든 워커 스레드가 payment-gateway 응답을 기다리며 블로킹되고 있습니다.',
      metrics: [
        {
          title: '트레이스 지연 분포 - order-service → payment-gateway',
          chartType: 'bar',
          chartConfig: {
            labels: ['0~1s', '1~5s', '5~10s', '10~20s', '20~30s', '30s (timeout)'],
            datasets: [
              {
                label: '요청 수',
                data: [12, 8, 15, 45, 120, 890],
                backgroundColor: [
                  'rgba(34,197,94,0.6)',
                  'rgba(34,197,94,0.4)',
                  'rgba(234,179,8,0.5)',
                  'rgba(249,115,22,0.5)',
                  'rgba(239,68,68,0.5)',
                  'rgba(239,68,68,0.8)'
                ],
                borderColor: [
                  '#22c55e',
                  '#22c55e',
                  '#eab308',
                  '#f97316',
                  '#ef4444',
                  '#ef4444'
                ],
                borderWidth: 1
              }
            ]
          }
        },
        {
          title: 'order-service 스레드풀 상태',
          chartType: 'line',
          chartConfig: {
            labels: ['10:00', '10:10', '10:20', '10:25', '10:30', '10:35', '10:40', '10:47'],
            datasets: [
              {
                label: '활성 스레드',
                data: [20, 25, 80, 150, 198, 200, 200, 200],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239,68,68,0.1)',
                fill: true
              },
              {
                label: '최대 스레드',
                data: [200, 200, 200, 200, 200, 200, 200, 200],
                borderColor: '#6b7280',
                borderDash: [5, 5],
                pointRadius: 0
              },
              {
                label: '대기열 깊이',
                data: [0, 2, 15, 85, 250, 500, 800, 1200],
                borderColor: '#f97316',
                backgroundColor: 'rgba(249,115,22,0.1)',
                fill: true
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '10:25:03', level: 'WARN', source: 'order-service', message: 'payment-gateway call latency exceeded SLO: p99=15023ms (target: 500ms)' },
        { timestamp: '10:28:17', level: 'ERROR', source: 'order-service', message: 'POST https://payment-gateway.external.io/v2/charge → 503 Service Unavailable (29847ms)' },
        { timestamp: '10:30:44', level: 'ERROR', source: 'order-service', message: 'Connection pool exhausted for payment-gateway: active=50/50, pending=312' },
        { timestamp: '10:33:21', level: 'WARN', source: 'order-service', message: 'Fallback not configured for PaymentService.processPayment() - no circuit breaker registered' },
        { timestamp: '10:36:09', level: 'ERROR', source: 'order-service', message: 'ThreadPoolTaskExecutor [http-thread-pool]: rejected task - pool is full (200/200), queue is full (1200/1200)' },
        { timestamp: '10:40:55', level: 'CRITICAL', source: 'api-gateway', message: 'Upstream timeout: order-service did not respond within 30000ms' }
      ],
      choices: [
        {
          text: 'payment-gateway의 상태 페이지와 외부 서비스 현황을 확인한다',
          feedback: '정확합니다! 트레이싱으로 병목이 payment-gateway임을 확인했으니, 외부 서비스의 상태를 직접 확인하는 것이 다음 단계입니다.',
          isOptimal: true,
          nextStep: 'step-3a'
        },
        {
          text: 'payment-gateway 호출의 타임아웃을 60초로 늘린다',
          feedback: '장애 상황에서 타임아웃을 늘리면 더 많은 스레드가 더 오래 블로킹됩니다. 이는 상황을 더 악화시킵니다.',
          isDeadEnd: true,
          nextStep: 'step-3-deadend-timeout'
        }
      ],
      hint: '분산 트레이싱에서 병목 지점을 찾았다면, 해당 서비스(payment-gateway)가 왜 느린지 직접 확인해야 합니다. 외부 서비스라면 상태 페이지(status page)를 확인해보세요.'
    },

    // ──────────────────────────────────────────────
    // Dead-end: Pod 재시작
    // ──────────────────────────────────────────────
    'step-2-deadend-restart': {
      id: 'step-2-deadend-restart',
      title: '모든 Pod 재시작 - 효과 없음',
      description: 'kubectl rollout restart를 실행하여 모든 서비스의 Pod을 재시작했습니다. 약 2분간 서비스가 완전히 중단되었고, 새 Pod이 올라온 후에도 payment-gateway로의 요청이 계속 타임아웃되면서 동일한 에러가 즉시 재발합니다. 오히려 재시작 동안 처리하지 못한 요청들이 쌓이면서 상황이 더 악화되었습니다.',
      isDeadEnd: true,
      learningMoment: {
        title: '외부 의존성 장애 시 Pod 재시작의 한계',
        explanation: '서비스 재시작은 메모리 누수나 내부 상태 오류에는 효과적이지만, 외부 의존성 장애에는 무의미합니다. 재시작된 Pod도 동일한 외부 서비스를 호출하므로 같은 문제에 부딪힙니다. 오히려 재시작 중 기존 in-flight 요청이 모두 실패하고, cold start로 인해 일시적으로 성능이 더 저하됩니다. <strong>근본 원인을 먼저 파악한 후 조치하는 것이 중요합니다.</strong>',
        moduleReference: '참고: Module 5 - 장애 분석 프로세스'
      },
      redirectTo: 'step-1',
      redirectMessage: '알림 확인으로 돌아가기'
    },

    // ──────────────────────────────────────────────
    // Step 2b: 데이터베이스 확인 (우회 경로)
    // ──────────────────────────────────────────────
    'step-2b': {
      id: 'step-2b',
      title: '데이터베이스 상태 확인',
      description: 'RDS 모니터링을 확인해보니 데이터베이스는 정상입니다. CPU 사용률 12%, 활성 커넥션 45/200, 슬로우 쿼리 없음, 레플리카 지연 0.2ms. 데이터베이스가 원인이 아닌 것으로 확인되었습니다. 다시 에러 로그를 살펴보니, payment-gateway 관련 타임아웃 메시지가 대량으로 발생하고 있습니다.',
      metrics: [
        {
          title: 'RDS 메트릭 (정상 범위)',
          chartType: 'line',
          chartConfig: {
            labels: ['10:00', '10:10', '10:20', '10:25', '10:30', '10:35', '10:40', '10:47'],
            datasets: [
              {
                label: 'CPU 사용률 (%)',
                data: [11, 12, 12, 13, 14, 13, 12, 12],
                borderColor: '#22c55e',
                borderWidth: 2
              },
              {
                label: '활성 커넥션',
                data: [40, 42, 43, 44, 46, 47, 45, 45],
                borderColor: '#3b82f6',
                borderWidth: 2
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '10:30:00', level: 'INFO', source: 'rds-monitor', message: 'Database health check: OK. CPU=12%, Connections=45/200, Replication lag=0.2ms' },
        { timestamp: '10:30:01', level: 'INFO', source: 'rds-monitor', message: 'No slow queries detected in the last 30 minutes' },
        { timestamp: '10:30:02', level: 'INFO', source: 'rds-monitor', message: 'Storage IOPS: 1,200 (provisioned: 10,000). Throughput: normal' }
      ],
      choices: [
        {
          text: '서비스 의존성 맵과 분산 트레이싱을 확인한다',
          feedback: '데이터베이스는 정상이므로, 서비스 간 호출 관계를 추적하는 것이 올바른 방향입니다.',
          isOptimal: true,
          nextStep: 'step-2a'
        }
      ],
      hint: '데이터베이스가 정상이라면 애플리케이션 레벨의 문제를 살펴봐야 합니다. 서비스 간 의존성을 확인해보세요.'
    },

    // ──────────────────────────────────────────────
    // Step 3a: 외부 결제 게이트웨이 상태 확인 (최적 경로)
    // ──────────────────────────────────────────────
    'step-3a': {
      id: 'step-3a',
      title: '외부 결제 게이트웨이 상태 확인',
      description: 'payment-gateway의 공식 상태 페이지(status.payment-gateway.io)를 확인했습니다. 현재 "Degraded Performance" 상태이며, 아시아 리전에서 간헐적 503 에러와 높은 지연이 발생하고 있다고 공지되어 있습니다. 예상 복구 시간(ETA)은 아직 제공되지 않았습니다. 문제는 외부 서비스 장애인데, 우리 시스템은 왜 이렇게 심하게 영향을 받고 있을까요?',
      metrics: [
        {
          title: 'payment-gateway 외부 상태 (status.payment-gateway.io)',
          chartType: 'line',
          chartConfig: {
            labels: ['09:00', '09:30', '10:00', '10:10', '10:20', '10:30', '10:40', '10:47'],
            datasets: [
              {
                label: 'API 가용률 (%)',
                data: [99.9, 99.8, 98.5, 85.2, 62.1, 45.3, 38.7, 35.2],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239,68,68,0.1)',
                fill: true,
                borderWidth: 2
              },
              {
                label: 'SLA 목표 (99.9%)',
                data: [99.9, 99.9, 99.9, 99.9, 99.9, 99.9, 99.9, 99.9],
                borderColor: '#22c55e',
                borderDash: [5, 5],
                pointRadius: 0
              }
            ]
          }
        },
        {
          title: 'payment-gateway 평균 응답시간 (ms)',
          chartType: 'line',
          chartConfig: {
            labels: ['09:00', '09:30', '10:00', '10:10', '10:20', '10:30', '10:40', '10:47'],
            datasets: [
              {
                label: '응답시간',
                data: [180, 195, 450, 2800, 12000, 25000, 29000, 30000],
                borderColor: '#f97316',
                backgroundColor: 'rgba(249,115,22,0.15)',
                fill: true,
                borderWidth: 2
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '10:20:00', level: 'INFO', source: 'status-page', message: '[payment-gateway] Status: Degraded Performance - Asia Pacific region' },
        { timestamp: '10:30:00', level: 'WARN', source: 'status-page', message: '[payment-gateway] Investigating increased error rates. ETA: TBD' },
        { timestamp: '10:40:00', level: 'ERROR', source: 'status-page', message: '[payment-gateway] Major outage in AP region. 503 errors and timeouts reported.' },
        { timestamp: '10:42:33', level: 'ERROR', source: 'order-service', message: 'All 50 HTTP connections to payment-gateway are in WAITING state' },
        { timestamp: '10:44:17', level: 'WARN', source: 'order-service', message: 'No CircuitBreaker bean found for method: PaymentService.processPayment - requests flowing directly to failed upstream' }
      ],
      choices: [
        {
          text: 'order-service의 서킷 브레이커 설정을 확인한다',
          feedback: '핵심을 정확히 파악했습니다! 외부 서비스가 장애인데 우리 시스템이 과도하게 영향받는 이유는 서킷 브레이커가 없기 때문입니다.',
          isOptimal: true,
          nextStep: 'step-4a'
        },
        {
          text: 'payment-gateway가 복구될 때까지 기다린다',
          feedback: '외부 서비스의 복구 시점을 예측할 수 없습니다. 기다리는 동안 카스케이딩 장애는 계속 확산됩니다.',
          isDeadEnd: true,
          nextStep: 'step-3-deadend-wait'
        }
      ],
      hint: '외부 서비스 장애 자체는 통제할 수 없지만, 우리 시스템이 외부 장애에 대해 어떻게 반응하는지(resilience)는 통제할 수 있습니다. 서킷 브레이커, 타임아웃, 벌크헤드 등의 패턴을 확인해보세요.'
    },

    // ──────────────────────────────────────────────
    // Dead-end: 타임아웃 증가
    // ──────────────────────────────────────────────
    'step-3-deadend-timeout': {
      id: 'step-3-deadend-timeout',
      title: '타임아웃 증가 - 상황 악화',
      description: 'payment-gateway 호출의 타임아웃을 30초에서 60초로 늘렸습니다. 그 결과 스레드들이 더 오래 블로킹 상태로 유지되면서 스레드풀이 더 빠르게 소진되었습니다. 이전에는 30초 후 타임아웃으로 실패하던 요청들이 이제 60초 동안 스레드를 점유합니다. 서비스 전체가 완전히 응답 불가 상태가 되었습니다.',
      isDeadEnd: true,
      learningMoment: {
        title: '장애 시 타임아웃 증가는 폭발 반경을 확대한다',
        explanation: '타임아웃 값을 높이면 각 요청이 스레드/커넥션을 더 오래 점유합니다. 장애 상황에서 이는 리소스 소진을 가속화하여 폭발 반경(blast radius)을 오히려 넓힙니다. <strong>올바른 접근은 타임아웃을 줄이거나(fast-fail), 서킷 브레이커를 도입하여 실패한 의존성으로의 요청을 차단하는 것입니다.</strong> 타임아웃 버짓(timeout budget) 개념을 적용하면 전체 요청 체인의 총 타임아웃을 관리할 수 있습니다.',
        moduleReference: '참고: Module 5 - 타임아웃 및 Resilience 패턴'
      },
      redirectTo: 'step-2a',
      redirectMessage: '트레이싱 분석으로 돌아가기'
    },

    // ──────────────────────────────────────────────
    // Dead-end: 복구 대기
    // ──────────────────────────────────────────────
    'step-3-deadend-wait': {
      id: 'step-3-deadend-wait',
      title: '복구 대기 - SLO 소진 중',
      description: '20분이 지났지만 payment-gateway는 여전히 복구되지 않았습니다. 그 동안 카스케이딩 장애가 더 확산되어 api-gateway까지 완전히 응답 불가 상태가 되었습니다. 월간 SLO 에러 버짓의 80%가 이미 소진되었으며, 고객 이탈과 매출 손실이 계속되고 있습니다. CS 팀에서 긴급 에스컬레이션이 올라왔습니다.',
      isDeadEnd: true,
      learningMoment: {
        title: '카스케이딩 장애에서 수동적 대기는 위험하다',
        explanation: '외부 의존성 장애 시 수동적으로 복구를 기다리는 것은 최악의 전략입니다. 복구 시점을 예측할 수 없고, 대기하는 동안 장애가 계속 전파됩니다. <strong>능동적 대응이 필요합니다:</strong> 서킷 브레이커를 열어 실패하는 의존성을 격리하거나, Feature Flag으로 해당 기능을 비활성화하거나, 대체 경로(fallback)를 활성화해야 합니다. "할 수 있는 게 없다"는 거의 항상 틀린 판단입니다.',
        moduleReference: '참고: Module 1 - SLO 에러 버짓 관리'
      },
      redirectTo: 'step-3a',
      redirectMessage: '게이트웨이 상태 확인으로 돌아가기'
    },

    // ──────────────────────────────────────────────
    // Step 4a: 서킷 브레이커 확인 (최적 경로)
    // ──────────────────────────────────────────────
    'step-4a': {
      id: 'step-4a',
      title: '서킷 브레이커 설정 확인',
      description: 'order-service의 설정을 확인했습니다. payment-gateway 호출에 대한 서킷 브레이커가 전혀 구성되어 있지 않습니다! Resilience4j 의존성은 pom.xml에 있지만, @CircuitBreaker 어노테이션이 PaymentService에 적용되지 않았습니다. 모든 요청이 필터링 없이 장애가 발생한 payment-gateway로 직접 전달되고 있습니다. 즉시 조치가 필요합니다.',
      metrics: [
        {
          title: '현재 요청 흐름 (서킷 브레이커 없음)',
          chartType: 'bar',
          chartConfig: {
            labels: ['order-service → payment-gw', '성공', '503 에러', '타임아웃'],
            datasets: [
              {
                label: '최근 5분 요청 수',
                data: [2847, 142, 1205, 1500],
                backgroundColor: [
                  'rgba(99,102,241,0.6)',
                  'rgba(34,197,94,0.6)',
                  'rgba(239,68,68,0.6)',
                  'rgba(249,115,22,0.6)'
                ],
                borderColor: [
                  '#6366f1',
                  '#22c55e',
                  '#ef4444',
                  '#f97316'
                ],
                borderWidth: 1
              }
            ]
          }
        },
        {
          title: '리소스 소진 현황',
          chartType: 'line',
          chartConfig: {
            labels: ['10:00', '10:10', '10:20', '10:25', '10:30', '10:35', '10:40', '10:47'],
            datasets: [
              {
                label: 'HTTP 커넥션 풀 사용률 (%)',
                data: [10, 12, 40, 75, 95, 100, 100, 100],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239,68,68,0.1)',
                fill: true
              },
              {
                label: '스레드풀 사용률 (%)',
                data: [10, 12.5, 40, 75, 99, 100, 100, 100],
                borderColor: '#f97316',
                backgroundColor: 'rgba(249,115,22,0.1)',
                fill: true
              },
              {
                label: 'JVM Heap 사용률 (%)',
                data: [35, 38, 45, 58, 72, 81, 86, 89],
                borderColor: '#eab308',
                backgroundColor: 'rgba(234,179,8,0.1)',
                fill: true
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '10:42:00', level: 'WARN', source: 'order-service', message: 'No CircuitBreaker bean found for method: PaymentService.processPayment()' },
        { timestamp: '10:42:01', level: 'INFO', source: 'config-audit', message: 'resilience4j.circuitbreaker.instances.paymentService: NOT CONFIGURED' },
        { timestamp: '10:42:02', level: 'INFO', source: 'config-audit', message: 'resilience4j.bulkhead.instances.paymentService: NOT CONFIGURED' },
        { timestamp: '10:42:03', level: 'INFO', source: 'config-audit', message: 'resilience4j.timelimiter.instances.paymentService: NOT CONFIGURED' },
        { timestamp: '10:42:05', level: 'CRITICAL', source: 'order-service', message: 'JVM heap usage at 89%. GC pause time increasing. OOM risk detected.' },
        { timestamp: '10:43:11', level: 'ERROR', source: 'inventory-service', message: 'BulkheadFullException: order-service bulkhead is full. max concurrent calls: 25' }
      ],
      choices: [
        {
          text: 'Feature Flag로 결제 기능을 비활성화하고 Graceful Degradation을 적용한다',
          feedback: '긴급 상황에서 최선의 선택입니다! Feature Flag으로 장애 의존성을 즉시 격리하면 카스케이딩을 차단할 수 있습니다.',
          isOptimal: true,
          nextStep: 'step-5a'
        },
        {
          text: 'Resilience4j 서킷 브레이커 설정을 즉시 코드에 추가하고 배포한다',
          feedback: '서킷 브레이커 추가는 올바른 방향이지만, 코드 변경 → 빌드 → 배포 파이프라인을 거치면 최소 15~20분이 소요됩니다. 긴급 상황에서는 Feature Flag이 더 빠릅니다.',
          nextStep: 'step-5a'
        }
      ],
      hint: '서킷 브레이커가 없는 상태에서 가장 빠르게 장애를 격리하는 방법은 무엇일까요? 코드 배포 없이 즉시 적용 가능한 방법을 생각해보세요.'
    },

    // ──────────────────────────────────────────────
    // Step 5a: Feature Flag 적용 (최적 경로)
    // ──────────────────────────────────────────────
    'step-5a': {
      id: 'step-5a',
      title: 'Feature Flag 적용 및 Graceful Degradation',
      description: 'LaunchDarkly에서 "payment-processing-enabled" Feature Flag을 OFF로 전환했습니다. order-service가 payment-gateway 호출 대신 "결제 일시 중단 - 잠시 후 다시 시도해주세요" 메시지를 반환합니다. 즉시 효과가 나타나기 시작합니다: 스레드풀이 해제되고, 에러율이 급격히 감소하고, 다른 서비스들도 정상화되기 시작합니다.',
      metrics: [
        {
          title: '서비스별 에러율 변화 (Feature Flag 적용 후)',
          chartType: 'line',
          chartConfig: {
            labels: ['10:47', '10:49', '10:51', '10:53', '10:55', '10:57', '10:59', '11:01'],
            datasets: [
              {
                label: 'order-service',
                data: [78.3, 45.2, 18.6, 5.2, 1.8, 0.8, 0.4, 0.3],
                borderColor: '#ef4444',
                borderWidth: 2
              },
              {
                label: 'inventory-service',
                data: [55.2, 38.1, 15.3, 4.8, 1.5, 0.5, 0.2, 0.1],
                borderColor: '#f97316',
                borderWidth: 2
              },
              {
                label: 'notification-service',
                data: [42.1, 28.4, 12.7, 3.1, 0.9, 0.3, 0.1, 0.1],
                borderColor: '#eab308',
                borderWidth: 2
              },
              {
                label: 'api-gateway',
                data: [60.8, 35.6, 14.2, 3.8, 1.2, 0.4, 0.2, 0.2],
                borderColor: '#a855f7',
                borderWidth: 2
              }
            ]
          }
        },
        {
          title: 'order-service 리소스 회복',
          chartType: 'line',
          chartConfig: {
            labels: ['10:47', '10:49', '10:51', '10:53', '10:55', '10:57', '10:59', '11:01'],
            datasets: [
              {
                label: '활성 스레드',
                data: [200, 180, 120, 65, 35, 25, 22, 20],
                borderColor: '#22c55e',
                backgroundColor: 'rgba(34,197,94,0.1)',
                fill: true
              },
              {
                label: '대기열 깊이',
                data: [1200, 800, 350, 80, 15, 3, 0, 0],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59,130,246,0.1)',
                fill: true
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '10:48:00', level: 'INFO', source: 'feature-flag', message: 'Flag "payment-processing-enabled" toggled OFF by oncall-engineer@company.com' },
        { timestamp: '10:48:05', level: 'INFO', source: 'order-service', message: 'Payment processing disabled via feature flag. Returning graceful degradation response.' },
        { timestamp: '10:49:30', level: 'INFO', source: 'order-service', message: 'Thread pool recovering: active=180/200, queue=800 (decreasing)' },
        { timestamp: '10:52:00', level: 'INFO', source: 'api-gateway', message: 'Backend health improving. Healthy endpoints: 3/4' },
        { timestamp: '10:55:00', level: 'INFO', source: 'order-service', message: 'Thread pool normal: active=35/200, queue=15. Service responding normally.' },
        { timestamp: '10:58:00', level: 'INFO', source: 'notification-service', message: 'Message queue backlog cleared. Pending: 0 messages' }
      ],
      choices: [
        {
          text: 'payment-gateway 복구를 모니터링하면서 서킷 브레이커 패턴 구현을 시작한다',
          feedback: '완벽한 접근입니다! 즉각적인 위기를 해결한 후 근본적인 방어 체계를 구축하는 것이 올바른 순서입니다.',
          isOptimal: true,
          nextStep: 'step-6a'
        }
      ],
      hint: '긴급 조치로 서비스가 안정화되었습니다. 이제 같은 문제가 재발하지 않도록 영구적인 방어 체계를 구축해야 합니다.'
    },

    // ──────────────────────────────────────────────
    // Step 6a: 서킷 브레이커 패턴 구현 (최적 경로)
    // ──────────────────────────────────────────────
    'step-6a': {
      id: 'step-6a',
      title: '서킷 브레이커 패턴 설계 및 구현',
      description: 'payment-gateway가 11:15에 복구를 확인했습니다. Feature Flag을 다시 ON으로 전환하기 전에, Resilience4j 기반 서킷 브레이커를 설계합니다. 실패율 50% 이상 시 OPEN, 30초 후 HALF-OPEN에서 3개 요청으로 테스트, 성공 시 CLOSED로 전환합니다. 타임아웃도 30초에서 3초로 줄이고, fallback 로직을 추가합니다.',
      metrics: [
        {
          title: '서킷 브레이커 상태 전이 시뮬레이션',
          chartType: 'line',
          chartConfig: {
            labels: ['CLOSED', '실패 증가', 'OPEN (차단)', '30s 대기', 'HALF-OPEN', '테스트 성공', 'CLOSED (복구)'],
            datasets: [
              {
                label: '실패율 (%)',
                data: [2, 35, 75, 75, 40, 10, 2],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239,68,68,0.1)',
                fill: true,
                borderWidth: 2
              },
              {
                label: '처리량 (req/s)',
                data: [500, 350, 0, 0, 15, 200, 480],
                borderColor: '#22c55e',
                backgroundColor: 'rgba(34,197,94,0.1)',
                fill: true,
                borderWidth: 2
              },
              {
                label: '임계값 (50%)',
                data: [50, 50, 50, 50, 50, 50, 50],
                borderColor: '#fbbf24',
                borderDash: [5, 5],
                pointRadius: 0
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '11:15:00', level: 'INFO', source: 'status-page', message: '[payment-gateway] Status: Operational - Asia Pacific region recovered' },
        { timestamp: '11:20:00', level: 'INFO', source: 'deploy', message: 'Deploying order-service v2.14.1 with CircuitBreaker configuration' },
        { timestamp: '11:20:01', level: 'INFO', source: 'config', message: 'resilience4j.circuitbreaker.paymentService: failureRateThreshold=50, waitDurationInOpenState=30s, slidingWindowSize=20' },
        { timestamp: '11:20:02', level: 'INFO', source: 'config', message: 'resilience4j.timelimiter.paymentService: timeoutDuration=3s (was: 30s)' },
        { timestamp: '11:20:03', level: 'INFO', source: 'config', message: 'resilience4j.circuitbreaker.paymentService: fallback=PaymentFallbackService.handlePaymentUnavailable()' },
        { timestamp: '11:25:00', level: 'INFO', source: 'order-service', message: 'CircuitBreaker [paymentService] state: CLOSED. Feature flag re-enabled. Payment processing resumed.' }
      ],
      choices: [
        {
          text: '폭발 반경 분석 및 벌크헤드 격리 패턴을 추가 구현한다',
          feedback: '서킷 브레이커만으로는 충분하지 않습니다. 벌크헤드로 리소스를 격리하면 한 의존성의 장애가 전체 스레드풀을 소진하지 못하게 막을 수 있습니다.',
          isOptimal: true,
          nextStep: 'step-7a'
        }
      ],
      hint: '서킷 브레이커는 실패하는 호출을 차단하지만, 스레드풀을 의존성별로 분리하는 것은 별도의 패턴이 필요합니다. 벌크헤드(Bulkhead) 패턴을 생각해보세요.'
    },

    // ──────────────────────────────────────────────
    // Step 7a: 벌크헤드 격리 및 종합 설계 (최적 경로)
    // ──────────────────────────────────────────────
    'step-7a': {
      id: 'step-7a',
      title: '벌크헤드 격리 및 Resilience 종합 설계',
      description: '카스케이딩 장애의 전체 폭발 반경을 분석합니다. payment-gateway 호출이 order-service의 전체 스레드풀을 소진시킨 것이 핵심 문제였습니다. 벌크헤드 패턴으로 payment 호출용 스레드풀을 별도로 분리하고(최대 30개), 나머지 비즈니스 로직은 별도 풀에서 동작하도록 격리합니다. 타임아웃 버짓도 체인 전체에 걸쳐 설계합니다.',
      metrics: [
        {
          title: '벌크헤드 적용 전/후 비교 - 장애 시 스레드 사용',
          chartType: 'bar',
          chartConfig: {
            labels: ['결제 스레드', '주문처리 스레드', '재고조회 스레드', '기타 스레드'],
            datasets: [
              {
                label: '벌크헤드 없음 (장애 시)',
                data: [200, 0, 0, 0],
                backgroundColor: 'rgba(239,68,68,0.6)',
                borderColor: '#ef4444',
                borderWidth: 1
              },
              {
                label: '벌크헤드 적용 (장애 시)',
                data: [30, 80, 50, 40],
                backgroundColor: 'rgba(34,197,94,0.6)',
                borderColor: '#22c55e',
                borderWidth: 1
              }
            ]
          }
        },
        {
          title: '타임아웃 버짓 체인 설계 (ms)',
          chartType: 'bar',
          chartConfig: {
            labels: ['api-gateway', 'order-service', 'payment-gateway 호출', 'inventory-service', 'notification-service'],
            datasets: [
              {
                label: '이전 타임아웃',
                data: [60000, 30000, 30000, 10000, 10000],
                backgroundColor: 'rgba(239,68,68,0.5)',
                borderColor: '#ef4444',
                borderWidth: 1
              },
              {
                label: '개선된 타임아웃',
                data: [5000, 4000, 3000, 2000, 2000],
                backgroundColor: 'rgba(34,197,94,0.5)',
                borderColor: '#22c55e',
                borderWidth: 1
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '11:30:00', level: 'INFO', source: 'architect', message: 'Resilience pattern implementation plan: CircuitBreaker + Bulkhead + TimeLimiter + Retry' },
        { timestamp: '11:30:01', level: 'INFO', source: 'config', message: 'resilience4j.bulkhead.paymentService: maxConcurrentCalls=30, maxWaitDuration=500ms' },
        { timestamp: '11:30:02', level: 'INFO', source: 'config', message: 'resilience4j.bulkhead.orderProcessing: maxConcurrentCalls=80, maxWaitDuration=1000ms' },
        { timestamp: '11:30:03', level: 'INFO', source: 'config', message: 'resilience4j.bulkhead.inventoryCheck: maxConcurrentCalls=50, maxWaitDuration=500ms' },
        { timestamp: '11:30:04', level: 'INFO', source: 'config', message: 'Timeout budget chain: api-gw(5s) > order(4s) > payment(3s), inventory(2s), notification(2s)' },
        { timestamp: '11:30:05', level: 'INFO', source: 'architect', message: 'Added Grafana dashboard for circuit breaker state monitoring with PagerDuty alerts on OPEN transitions' }
      ],
      choices: [
        {
          text: '최종 포스트모템을 작성하고 조사를 완료한다',
          feedback: '모든 근본 원인을 분석하고 재발 방지 대책까지 수립했습니다. 포스트모템으로 이번 장애에서 배운 교훈을 팀과 공유하세요.',
          isOptimal: true,
          nextStep: 'step-final'
        }
      ],
      hint: '모든 기술적 분석과 조치가 완료되었습니다. 이제 이 장애에서 배운 교훈을 문서화할 차례입니다.'
    },

    // ──────────────────────────────────────────────
    // 최종 결과
    // ──────────────────────────────────────────────
    'step-final': {
      id: 'step-final',
      title: '조사 완료 - 카스케이딩 장애 포스트모템',
      isTerminal: true,
      rootCause: {
        title: '외부 의존성에 대한 서킷 브레이커 미구성으로 인한 카스케이딩 장애',
        summary: '외부 결제 게이트웨이(payment-gateway)의 장애가 서킷 브레이커 없이 order-service에 직접 전파되었습니다. payment-gateway의 30초 타임아웃으로 인해 order-service의 전체 스레드풀(200개)이 소진되었고, 이로 인해 inventory-service, notification-service, api-gateway까지 연쇄적으로 장애가 확산되었습니다. 벌크헤드 격리가 없어 단일 외부 의존성의 장애가 전체 시스템을 마비시킨 전형적인 카스케이딩 장애 패턴입니다.',
        timeline: [
          { time: '10:00', event: 'payment-gateway 아시아 리전에서 성능 저하 시작 (응답시간 200ms → 450ms)' },
          { time: '10:10', event: 'payment-gateway 응답시간 급증 (2.8초), 간헐적 503 에러 발생 시작' },
          { time: '10:20', event: 'payment-gateway 대부분의 요청이 타임아웃(30초). order-service 스레드풀 40% 점유' },
          { time: '10:25', event: 'order-service 스레드풀 75% 점유. 일반 주문 처리 지연 시작' },
          { time: '10:30', event: 'order-service 스레드풀 99% 소진. inventory-service에 에러 전파 시작' },
          { time: '10:35', event: '모든 서비스에 장애 전파. api-gateway 에러율 30% 돌파' },
          { time: '10:40', event: 'order-service ThreadPoolExhausted. 전체 요청 거부. JVM 힙 89%' },
          { time: '10:47', event: 'P1 알림 발생. 온콜 엔지니어 대응 시작' },
          { time: '10:48', event: 'Feature Flag "payment-processing-enabled" OFF 전환' },
          { time: '10:55', event: '모든 서비스 에러율 정상 범위로 회복' },
          { time: '11:15', event: 'payment-gateway 복구 확인' },
          { time: '11:25', event: 'CircuitBreaker + TimeLimiter 설정 배포. Feature Flag 재활성화' },
          { time: '11:30', event: 'Bulkhead 격리 및 타임아웃 버짓 체인 설계 완료' }
        ],
        resolution: [
          '<strong>서킷 브레이커 구성</strong>: Resilience4j CircuitBreaker를 모든 외부 의존성 호출에 적용. 실패율 50% 초과 시 OPEN, 30초 후 HALF-OPEN에서 점진적 복구.',
          '<strong>타임아웃 버짓 최적화</strong>: payment-gateway 타임아웃을 30초 → 3초로 단축. 전체 호출 체인에 타임아웃 버짓 적용 (api-gw 5s > order 4s > payment 3s).',
          '<strong>벌크헤드 격리</strong>: 의존성별 전용 스레드풀 분리. payment 호출은 최대 30개 스레드로 제한하여 나머지 비즈니스 로직에 영향 차단.',
          '<strong>Fallback 로직</strong>: 결제 서비스 불가 시 "일시적 결제 중단" Graceful Degradation 응답 반환. 주문은 대기열에 저장 후 복구 시 자동 처리.',
          '<strong>Feature Flag 정비</strong>: 모든 외부 의존성에 Kill Switch용 Feature Flag 추가. 긴급 상황에서 코드 배포 없이 즉시 격리 가능.',
          '<strong>모니터링 강화</strong>: 서킷 브레이커 상태(CLOSED/OPEN/HALF-OPEN) Grafana 대시보드 추가. OPEN 전환 시 PagerDuty 자동 알림.',
          '<strong>카오스 엔지니어링</strong>: 분기별 Chaos Monkey 테스트로 외부 의존성 장애 시나리오 정기 검증.'
        ]
      },
      postMortem: {
        template: {
          fields: [
            {
              label: '장애 요약 (What happened?)',
              placeholder: '외부 결제 게이트웨이 장애가 어떻게 전체 시스템에 영향을 미쳤는지 요약하세요.'
            },
            {
              label: '근본 원인 (Root Cause)',
              placeholder: '서킷 브레이커 미구성, 벌크헤드 부재, 과도한 타임아웃 등 기술적 근본 원인을 기술하세요.'
            },
            {
              label: '영향 범위 (Impact)',
              placeholder: '영향받은 서비스, 사용자 수, 매출 손실, SLO 버짓 소진 등을 기술하세요.'
            },
            {
              label: '타임라인 (Timeline)',
              placeholder: '장애 발생 → 감지 → 대응 → 복구까지의 주요 시간대를 기록하세요.'
            },
            {
              label: '재발 방지 대책 (Action Items)',
              placeholder: '서킷 브레이커, 벌크헤드, 타임아웃 버짓, Feature Flag, 카오스 엔지니어링 등 구체적인 대책을 나열하세요.'
            },
            {
              label: '교훈 (Lessons Learned)',
              placeholder: '이번 장애에서 배운 점과 팀/조직 차원에서 개선할 사항을 기술하세요.'
            }
          ]
        }
      }
    }
  },

  optimalPath: ['step-1', 'step-2a', 'step-3a', 'step-4a', 'step-5a', 'step-6a', 'step-7a'],

  scoring: {
    gradeThresholds: {
      S: { maxExtraSteps: 0, maxHints: 0, label: '장애 대응 전문가' },
      A: { maxExtraSteps: 2, maxHints: 1, label: '숙련된 엔지니어' },
      B: { maxExtraSteps: 4, maxHints: 2, label: '성장 중인 엔지니어' },
      C: { maxExtraSteps: Infinity, maxHints: Infinity, label: '학습 중' }
    }
  }
};
