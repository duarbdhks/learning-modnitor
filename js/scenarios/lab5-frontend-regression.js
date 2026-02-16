var SCENARIO_LAB5 = {
  id: 'lab5-graphql-api-regression',
  title: 'GraphQL API 성능 회귀',
  difficulty: 'intermediate',

  alert: {
    severity: 'warning',
    source: 'Datadog RUM',
    timestamp: '2024-04-10 11:15:22 KST',
    title: '[P2] GraphQL API 응답시간 급등 — @resource.duration p95 > 3s',
    message: 'v3.2.0 배포 이후 GraphQL API 응답시간(p95)이 380ms에서 3,200ms로 급등. 프론트엔드 페이지 로딩 지연과 사용자 이탈 증가.',
    metric: { name: '@resource.duration p95', value: '3,200', unit: 'ms', threshold: '1,000' },
    tags: ['service:graphql-gateway', 'env:production', 'deploy:v3.2.0']
  },

  briefing: {
    description: '오전 11시경 프론트엔드 팀에서 페이지 로딩이 느려졌다는 보고가 들어왔습니다. Datadog RUM에서 GraphQL API 호출의 응답시간(@resource.duration)이 배포 시점과 일치하여 급등한 것을 확인했습니다. 서버 CPU와 메모리는 정상 범위이며, 특정 GraphQL operation에서만 문제가 집중되는 것으로 보입니다.',
    environment: {
      services: ['graphql-gateway (Node.js)', 'user-service', 'order-service', 'RDS Aurora MySQL'],
      infra: 'EKS, RDS Aurora (db.r6g.xlarge), ElastiCache Redis',
      monitoring: 'Datadog RUM + APM + RDS Integration'
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
      title: '초기 증상 분석 — RUM 메트릭 확인',
      description: 'Datadog RUM에서 GraphQL API 응답시간(@resource.duration) 급등을 확인했습니다. 배포 v3.2.0 이후 p95 응답시간이 380ms에서 3,200ms로 급증했습니다. 서버 CPU(25%), 메모리(45%)는 정상 범위이며, 에러율도 0.2%로 안정적입니다.',
      metrics: [
        {
          title: '@resource.duration (p50/p95/p99)',
          chartType: 'line',
          chartConfig: {
            labels: ['10:30', '10:45', '11:00', '11:15', '11:30', '11:45', '12:00'],
            datasets: [
              {
                label: 'p50',
                data: [180, 185, 190, 1200, 1350, 1280, 1240],
                borderColor: '#22c55e',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                tension: 0.4
              },
              {
                label: 'p95',
                data: [380, 390, 410, 3200, 3500, 3300, 3150],
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                tension: 0.4
              },
              {
                label: 'p99',
                data: [820, 850, 880, 5800, 6200, 6000, 5900],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.4
              }
            ]
          }
        },
        {
          title: 'GraphQL Gateway CPU/Memory',
          chartType: 'line',
          chartConfig: {
            labels: ['10:30', '10:45', '11:00', '11:15', '11:30', '11:45', '12:00'],
            datasets: [
              {
                label: 'CPU %',
                data: [22, 23, 24, 25, 26, 25, 24],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.4,
                yAxisID: 'y'
              },
              {
                label: 'Memory %',
                data: [42, 43, 44, 45, 46, 45, 44],
                borderColor: '#8b5cf6',
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                tension: 0.4,
                yAxisID: 'y'
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '11:15:22', level: 'WARN', service: 'graphql-gateway', message: 'Slow GraphQL query detected: GetUserDashboard took 3245ms' },
        { timestamp: '11:15:18', level: 'INFO', service: 'graphql-gateway', message: 'GraphQL request: operationName=GetUserDashboard, variables={userId:12345}' },
        { timestamp: '11:14:52', level: 'WARN', service: 'graphql-gateway', message: 'Slow GraphQL query detected: GetUserDashboard took 3102ms' },
        { timestamp: '11:14:45', level: 'INFO', service: 'deployment', message: 'Deployment v3.2.0 completed successfully for graphql-gateway' },
        { timestamp: '11:13:28', level: 'WARN', service: 'graphql-gateway', message: 'Slow GraphQL query detected: GetUserOrders took 2890ms' }
      ],
      choices: [
        {
          text: 'RUM에서 @context.apollo.client.operationName별로 응답시간 세분화 분석',
          isOptimal: true,
          feedback: '정답입니다! 특정 GraphQL operation에 문제가 집중되는 패턴을 확인하기 위해 operationName별 세분화가 필수적입니다.',
          nextStep: 'step-2a'
        },
        {
          text: 'Core Web Vitals (LCP, CLS, FID) 메트릭 확인하여 프론트엔드 렌더링 병목 파악',
          isOptimal: false,
          feedback: 'Core Web Vitals는 클라이언트 렌더링 성능을 측정하지만, 현재 문제는 서버 API 응답 지연입니다. CWV 개념 복습 후 API 응답시간 분석으로 전환하세요.',
          nextStep: 'step-2b-deadend'
        },
        {
          text: 'GraphQL Gateway Pod를 즉시 스케일아웃하여 처리량 증대',
          isOptimal: false,
          feedback: 'CPU/메모리가 정상 범위이므로 Pod 증설은 효과가 없습니다. 근본 원인은 쿼리 성능 문제일 가능성이 높습니다.',
          nextStep: 'step-2c-deadend'
        }
      ],
      hint: 'GraphQL API 응답시간이 급등했지만 서버 리소스는 정상입니다. 로그에서 특정 operation 이름이 반복적으로 나타나고 있습니다. 어떤 operation이 문제를 일으키는지 세분화 분석이 필요합니다.'
    },

    'step-2a': {
      title: 'Operation별 분석 — GetUserDashboard 병목 식별',
      description: 'RUM에서 @context.apollo.client.operationName으로 세분화한 결과, GetUserDashboard operation의 p95 응답시간이 3,800ms로 전체 평균을 크게 웃돌고 있습니다. 다른 operation(GetUserProfile: 420ms, GetUserOrders: 680ms)은 정상 범위입니다.',
      metrics: [
        {
          title: 'Operation별 @resource.duration (p95)',
          chartType: 'bar',
          chartConfig: {
            labels: ['GetUserDashboard', 'GetUserOrders', 'GetUserProfile', 'SearchProducts', 'GetCartItems'],
            datasets: [
              {
                label: 'p95 Response Time (ms)',
                data: [3800, 680, 420, 510, 390],
                backgroundColor: [
                  '#ef4444',
                  '#f59e0b',
                  '#22c55e',
                  '#22c55e',
                  '#22c55e'
                ]
              }
            ]
          }
        },
        {
          title: 'GetUserDashboard 호출 빈도',
          chartType: 'line',
          chartConfig: {
            labels: ['10:30', '10:45', '11:00', '11:15', '11:30', '11:45', '12:00'],
            datasets: [
              {
                label: 'Requests/min',
                data: [1150, 1180, 1200, 1220, 1240, 1210, 1190],
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                tension: 0.4
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '11:32:15', level: 'WARN', service: 'graphql-gateway', message: 'GetUserDashboard resolver took 3845ms for userId=12345' },
        { timestamp: '11:32:10', level: 'DEBUG', service: 'graphql-gateway', message: 'GetUserDashboard query: { user { id name recentOrders { id items { productName } } notifications { id message } preferences { theme language } } }' },
        { timestamp: '11:31:58', level: 'WARN', service: 'graphql-gateway', message: 'GetUserDashboard resolver took 3720ms for userId=67890' },
        { timestamp: '11:31:45', level: 'INFO', service: 'graphql-gateway', message: 'GetUserProfile completed in 385ms' },
        { timestamp: '11:31:30', level: 'INFO', service: 'graphql-gateway', message: 'GetUserOrders completed in 620ms' }
      ],
      choices: [
        {
          text: 'APM에서 trace.graphql.server.request.duration 분석하여 서버 측 병목 파악',
          isOptimal: true,
          feedback: '정확합니다! RUM은 클라이언트 관점 응답시간이므로, 서버 내부 처리 시간과 쿼리 패턴을 보려면 APM trace 분석이 필요합니다.',
          nextStep: 'step-3a'
        },
        {
          text: 'Redis 캐시 히트율 확인 — 캐시 미스로 인한 DB 부하 증가 가능성 점검',
          isOptimal: false,
          feedback: '캐시도 중요하지만, 먼저 APM trace로 정확히 어디서 시간이 소요되는지 파악하는 것이 우선입니다. 캐시는 나중에 점검하세요.',
          nextStep: 'step-3b'
        },
        {
          text: 'GraphQL complexity 제한 설정하여 과도한 nested query 차단',
          isOptimal: false,
          feedback: 'Complexity 제한은 예방책이지만, 현재 문제는 이미 배포된 쿼리에서 발생하고 있습니다. 근본 원인을 먼저 파악해야 합니다.',
          nextStep: 'step-3c-deadend'
        }
      ],
      hint: 'GetUserDashboard만 유독 느린 이유를 알려면, 서버 내부에서 어떤 처리가 오래 걸리는지 trace를 봐야 합니다. APM에서 GraphQL resolver 실행 시간과 하위 호출을 추적할 수 있습니다.'
    },

    'step-2b-deadend': {
      title: 'Core Web Vitals 분석 — 클라이언트 렌더링은 정상',
      description: 'Datadog RUM에서 Core Web Vitals를 확인한 결과, LCP(Largest Contentful Paint)는 1.2s(양호), CLS(Cumulative Layout Shift)는 0.05(우수), FID(First Input Delay)는 80ms(양호)로 모두 정상 범위입니다. 문제는 클라이언트 렌더링 성능이 아니라 서버 API 응답 지연입니다.',
      isDeadEnd: true,
      metrics: [
        {
          title: 'Core Web Vitals',
          chartType: 'bar',
          chartConfig: {
            labels: ['LCP (s)', 'CLS (×100)', 'FID (ms)'],
            datasets: [
              {
                label: 'Current',
                data: [1.2, 5, 80],
                backgroundColor: ['#22c55e', '#22c55e', '#22c55e']
              },
              {
                label: 'Threshold (Good)',
                data: [2.5, 10, 100],
                backgroundColor: ['#fbbf24', '#fbbf24', '#fbbf24']
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '11:35:00', level: 'INFO', service: 'rum', message: 'LCP: 1.2s for /dashboard page' },
        { timestamp: '11:35:00', level: 'INFO', service: 'rum', message: 'CLS: 0.05 (excellent stability)' },
        { timestamp: '11:35:00', level: 'INFO', service: 'rum', message: 'FID: 80ms (good interactivity)' },
        { timestamp: '11:35:00', level: 'DEBUG', service: 'rum', message: 'Rendering performance normal, bottleneck is API response time' }
      ],
      learningMoment: {
        title: 'Core Web Vitals vs API Response Time',
        explanation: 'Core Web Vitals(LCP, CLS, FID)는 **클라이언트 측 렌더링 성능**을 측정합니다. LCP는 페이지의 주요 콘텐츠가 화면에 표시되는 시간, CLS는 레이아웃 안정성, FID는 사용자 입력 응답성을 나타냅니다.\n\n현재 문제는 **서버 API 응답시간**(@resource.duration)이 급등한 것입니다. 클라이언트는 빠르게 렌더링하지만, API 응답을 기다리는 동안 로딩 스피너가 계속 표시되어 사용자 경험이 나빠집니다.\n\n**조사 방향**: RUM에서 API 응답시간 분석 → APM에서 서버 내부 병목 추적 → 데이터베이스 쿼리 성능 점검',
        moduleReference: 'Module 11: 프론트엔드 성능 회귀 (RUM + CWV 개념)'
      },
      redirectTo: 'step-2a',
      redirectMessage: 'Core Web Vitals는 정상입니다. GraphQL operation별 응답시간 분석으로 돌아가세요.'
    },

    'step-2c-deadend': {
      title: 'Pod 스케일아웃 시도 — 효과 없음',
      description: 'GraphQL Gateway Pod를 3개에서 6개로 증설했지만, 응답시간은 여전히 p95 3,200ms로 개선되지 않았습니다. CPU/메모리 사용률도 더 낮아졌지만(CPU 15%, Memory 30%) 문제는 지속됩니다. 근본 원인은 Pod 수가 아니라 **데이터베이스 쿼리 성능**에 있는 것으로 보입니다.',
      isDeadEnd: true,
      metrics: [
        {
          title: 'Pod 수 vs 응답시간',
          chartType: 'line',
          chartConfig: {
            labels: ['11:30', '11:35', '11:40', '11:45', '11:50', '11:55', '12:00'],
            datasets: [
              {
                label: '@resource.duration p95 (ms)',
                data: [3200, 3150, 3180, 3220, 3190, 3210, 3180],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.4,
                yAxisID: 'y'
              },
              {
                label: 'Pod Count',
                data: [3, 3, 6, 6, 6, 6, 6],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                stepped: true,
                yAxisID: 'y1'
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '11:45:00', level: 'INFO', service: 'k8s', message: 'graphql-gateway scaled from 3 to 6 replicas' },
        { timestamp: '11:50:00', level: 'WARN', service: 'graphql-gateway', message: 'GetUserDashboard still taking 3210ms after scale-out' },
        { timestamp: '11:52:00', level: 'INFO', service: 'graphql-gateway', message: 'CPU usage dropped to 15% across all pods' },
        { timestamp: '11:55:00', level: 'WARN', service: 'rds', message: 'select_latency remains high at 2800ms' }
      ],
      learningMoment: {
        title: '스케일아웃이 효과 없는 경우',
        explanation: 'Pod 증설은 **CPU/메모리 부족**으로 인한 처리량 병목을 해결합니다. 하지만 현재 상황은:\n\n1. **CPU/메모리는 이미 여유**있음 (25% → 15%)\n2. **문제는 데이터베이스 쿼리 지연**\n3. Pod를 아무리 늘려도 **느린 쿼리는 느린 채로** 실행됨\n\n**근본 원인**: N+1 쿼리, missing index, 비효율적 JOIN 등 **쿼리 성능 문제**는 애플리케이션 서버 확장으로 해결되지 않습니다. APM trace와 RDS 메트릭을 분석하여 쿼리 최적화가 필요합니다.',
        moduleReference: 'Module 8: 느린 쿼리로 인한 CPU 급등'
      },
      redirectTo: 'step-2a',
      redirectMessage: '스케일아웃은 효과가 없습니다. GraphQL operation별 분석으로 돌아가세요.'
    },

    'step-3a': {
      title: 'APM Trace 분석 — N+1 쿼리 패턴 발견',
      description: 'APM에서 trace.graphql.server.request.duration을 분석한 결과, GetUserDashboard resolver가 평균 3,600ms 소요되며, 그 중 2,800ms가 데이터베이스 쿼리에 사용됩니다. Span 분석 결과 **N+1 쿼리 패턴**이 발견되었습니다: user의 recentOrders를 조회한 후, 각 order마다 별도 쿼리로 items를 가져오고 있습니다 (평균 15개 order × 5개 items = 75번의 개별 쿼리).',
      metrics: [
        {
          title: 'trace.graphql.server.request.duration (GetUserDashboard)',
          chartType: 'bar',
          chartConfig: {
            labels: ['Total Duration', 'DB Queries', 'GraphQL Resolving', 'Network/Other'],
            datasets: [
              {
                label: 'Time (ms)',
                data: [3600, 2800, 650, 150],
                backgroundColor: ['#6366f1', '#ef4444', '#f59e0b', '#22c55e']
              }
            ]
          }
        },
        {
          title: 'DB Query Count per Request',
          chartType: 'doughnut',
          chartConfig: {
            labels: ['User Query (1)', 'Orders Query (1)', 'Order Items (75)', 'Notifications (1)'],
            datasets: [
              {
                data: [1, 1, 75, 1],
                backgroundColor: ['#22c55e', '#22c55e', '#ef4444', '#22c55e']
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '11:55:10', level: 'DEBUG', service: 'apm', message: 'Trace ID abc123: GetUserDashboard total 3620ms' },
        { timestamp: '11:55:10', level: 'DEBUG', service: 'apm', message: 'Span: user-service.getUser() - 120ms' },
        { timestamp: '11:55:10', level: 'DEBUG', service: 'apm', message: 'Span: user-service.getRecentOrders() - 180ms' },
        { timestamp: '11:55:10', level: 'WARN', service: 'apm', message: 'Span: user-service.getOrderItems() called 75 times - 2800ms total (N+1 pattern detected)' },
        { timestamp: '11:55:10', level: 'DEBUG', service: 'apm', message: 'Span: user-service.getNotifications() - 140ms' },
        { timestamp: '11:55:10', level: 'INFO', service: 'apm', message: 'SQL query: SELECT * FROM order_items WHERE order_id = ? (executed 75 times)' }
      ],
      choices: [
        {
          text: 'RDS 메트릭(aws.rds.select_latency)과 EXPLAIN ANALYZE로 쿼리 성능 분석',
          isOptimal: true,
          feedback: '정확합니다! N+1 쿼리가 확인되었으므로, RDS에서 실제 쿼리 실행 계획과 인덱스 사용 여부를 확인해야 합니다.',
          nextStep: 'step-4a'
        },
        {
          text: 'GraphQL DataLoader 적용하여 배치 쿼리로 전환 즉시 배포',
          isOptimal: false,
          feedback: 'DataLoader는 올바른 해결책이지만, 먼저 RDS에서 쿼리 성능과 인덱스 상태를 확인해야 합니다. 인덱스가 없으면 배치 쿼리도 느릴 수 있습니다.',
          nextStep: 'step-4b-deadend'
        },
        {
          text: 'GraphQL complexity 제한을 20으로 설정하여 nested query 차단',
          isOptimal: false,
          feedback: 'Complexity 제한은 과도한 중첩을 예방하지만, 현재 문제는 이미 승인된 쿼리의 비효율적 실행 패턴입니다. 근본 원인 해결이 우선입니다.',
          nextStep: 'step-3c-deadend'
        }
      ],
      hint: 'N+1 쿼리 패턴이 확인되었습니다. 75번의 개별 쿼리가 왜 느린지, 데이터베이스에서 인덱스를 제대로 사용하고 있는지 확인해야 합니다. RDS 메트릭과 실행 계획을 분석하세요.'
    },

    'step-3b': {
      title: 'Redis 캐시 분석 — 캐시는 정상 작동',
      description: 'ElastiCache Redis 메트릭을 확인한 결과, 캐시 히트율은 92%로 정상이며, GetUserDashboard는 캐시를 사용하지 않는 실시간 데이터를 조회합니다. 문제는 캐시가 아니라 **데이터베이스 쿼리 패턴**에 있습니다.',
      metrics: [
        {
          title: 'Redis Cache Hit Rate',
          chartType: 'doughnut',
          chartConfig: {
            labels: ['Cache Hit', 'Cache Miss'],
            datasets: [
              {
                data: [92, 8],
                backgroundColor: ['#22c55e', '#ef4444']
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '12:00:00', level: 'INFO', service: 'redis', message: 'Cache hit rate: 92% (normal)' },
        { timestamp: '12:00:00', level: 'DEBUG', service: 'graphql-gateway', message: 'GetUserDashboard bypasses cache for real-time data' },
        { timestamp: '12:00:00', level: 'INFO', service: 'redis', message: 'Eviction rate: 0.5% (healthy)' }
      ],
      choices: [
        {
          text: 'APM trace로 돌아가서 서버 내부 병목 분석',
          isOptimal: true,
          feedback: '정답입니다. 캐시는 정상이므로 APM에서 데이터베이스 쿼리 패턴을 분석해야 합니다.',
          nextStep: 'step-3a'
        }
      ],
      hint: '캐시는 정상입니다. APM trace로 돌아가서 데이터베이스 쿼리를 분석하세요.'
    },

    'step-3c-deadend': {
      title: 'GraphQL Complexity 제한 — 증상 차단, 근본 원인 미해결',
      description: 'GraphQL complexity를 20으로 제한하여 과도한 중첩 쿼리를 차단했지만, GetUserDashboard는 complexity 15로 여전히 허용 범위 내입니다. 응답시간은 개선되지 않았으며, 근본 원인인 **N+1 쿼리와 missing index**는 해결되지 않았습니다.',
      isDeadEnd: true,
      metrics: [
        {
          title: 'GraphQL Query Complexity',
          chartType: 'bar',
          chartConfig: {
            labels: ['GetUserDashboard', 'GetUserOrders', 'GetUserProfile', 'SearchProducts'],
            datasets: [
              {
                label: 'Complexity',
                data: [15, 8, 5, 12],
                backgroundColor: ['#f59e0b', '#22c55e', '#22c55e', '#22c55e']
              },
              {
                label: 'Limit',
                data: [20, 20, 20, 20],
                backgroundColor: ['#ef4444', '#ef4444', '#ef4444', '#ef4444']
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '12:05:00', level: 'INFO', service: 'graphql-gateway', message: 'Query complexity limit set to 20' },
        { timestamp: '12:07:00', level: 'WARN', service: 'graphql-gateway', message: 'GetUserDashboard (complexity 15) still takes 3580ms' },
        { timestamp: '12:08:00', level: 'INFO', service: 'graphql-gateway', message: 'No queries blocked by complexity limit' }
      ],
      learningMoment: {
        title: 'Complexity 제한 vs 쿼리 최적화',
        explanation: 'GraphQL complexity 제한은 **과도한 중첩 쿼리를 예방**하는 방어 기제입니다. 하지만 현재 문제는:\n\n1. **GetUserDashboard는 complexity 15로 허용 범위**\n2. **문제는 complexity가 아니라 N+1 쿼리 패턴**\n3. **Missing index로 인해 각 쿼리가 느림**\n\nComplexity 제한만으로는 이미 승인된 쿼리의 성능 문제를 해결할 수 없습니다. **근본 원인**: APM trace로 N+1 패턴을 확인하고, RDS에서 인덱스를 추가해야 합니다.',
        moduleReference: 'Module 8: 느린 쿼리로 인한 CPU 급등'
      },
      redirectTo: 'step-3a',
      redirectMessage: 'Complexity 제한은 예방책일 뿐입니다. APM trace 분석으로 돌아가세요.'
    },

    'step-4a': {
      title: 'RDS 분석 — Missing Index 발견',
      description: 'RDS Aurora 메트릭에서 aws.rds.select_latency가 2,800ms로 급등했으며, EXPLAIN ANALYZE 결과 order_items 테이블에서 **order_id 인덱스가 누락**되어 Full Table Scan이 발생하고 있습니다. v3.2.0 배포에서 새로운 컬럼 추가 마이그레이션 시 인덱스 재생성을 누락한 것으로 확인되었습니다.',
      metrics: [
        {
          title: 'aws.rds.select_latency',
          chartType: 'line',
          chartConfig: {
            labels: ['10:30', '10:45', '11:00', '11:15', '11:30', '11:45', '12:00'],
            datasets: [
              {
                label: 'select_latency p95 (ms)',
                data: [45, 48, 52, 2800, 2900, 2850, 2820],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.4
              }
            ]
          }
        },
        {
          title: 'RDS CPU Utilization',
          chartType: 'line',
          chartConfig: {
            labels: ['10:30', '10:45', '11:00', '11:15', '11:30', '11:45', '12:00'],
            datasets: [
              {
                label: 'CPU %',
                data: [22, 24, 25, 68, 72, 70, 68],
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                tension: 0.4
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '12:10:00', level: 'WARN', service: 'rds', message: 'High select_latency: 2845ms on order_items table' },
        { timestamp: '12:10:05', level: 'DEBUG', service: 'rds', message: 'EXPLAIN ANALYZE: SELECT * FROM order_items WHERE order_id = 12345' },
        { timestamp: '12:10:05', level: 'ERROR', service: 'rds', message: 'Full Table Scan detected: order_items (1.2M rows scanned, 0.5s per query)' },
        { timestamp: '12:10:10', level: 'INFO', service: 'rds', message: 'Missing index on order_items.order_id (index dropped during v3.2.0 migration)' },
        { timestamp: '12:10:15', level: 'DEBUG', service: 'rds', message: 'Migration log: ALTER TABLE order_items ADD COLUMN variant_id INT; (index recreation skipped)' }
      ],
      choices: [
        {
          text: 'order_items.order_id에 인덱스 추가 + GraphQL DataLoader로 N+1 해결',
          isOptimal: true,
          feedback: '완벽합니다! Missing index 추가로 쿼리 성능을 개선하고, DataLoader로 N+1 패턴을 근본적으로 해결합니다. 두 가지 모두 필수입니다.',
          nextStep: 'step-final'
        },
        {
          text: 'RDS 인스턴스를 db.r6g.2xlarge로 업그레이드하여 CPU 여유 확보',
          isOptimal: false,
          feedback: 'RDS 업그레이드는 임시방편일 뿐입니다. Missing index를 추가하지 않으면 Full Table Scan은 계속되며, 비용만 증가합니다.',
          nextStep: 'step-4c-deadend'
        }
      ],
      hint: 'order_items 테이블에서 order_id 인덱스가 없어 Full Table Scan이 발생하고 있습니다. 인덱스 추가와 함께 N+1 쿼리를 배치 쿼리로 전환하는 것이 근본적 해결책입니다.'
    },

    'step-4b-deadend': {
      title: 'DataLoader만 적용 — 인덱스 없이는 여전히 느림',
      description: 'GraphQL DataLoader를 적용하여 75번의 개별 쿼리를 1번의 배치 쿼리로 전환했지만, order_items 테이블에 order_id 인덱스가 없어 배치 쿼리도 Full Table Scan으로 실행됩니다. 응답시간은 3,200ms → 2,100ms로 소폭 개선되었지만 여전히 SLA(1,000ms)를 초과합니다.',
      isDeadEnd: true,
      metrics: [
        {
          title: '@resource.duration after DataLoader',
          chartType: 'line',
          chartConfig: {
            labels: ['Before', 'After DataLoader', 'SLA'],
            datasets: [
              {
                label: 'p95 Response Time (ms)',
                data: [3200, 2100, 1000],
                borderColor: ['#ef4444', '#f59e0b', '#22c55e'],
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '12:15:00', level: 'INFO', service: 'graphql-gateway', message: 'DataLoader deployed: batch query replaces 75 individual queries' },
        { timestamp: '12:18:00', level: 'WARN', service: 'rds', message: 'Batch query: SELECT * FROM order_items WHERE order_id IN (...) still taking 1800ms' },
        { timestamp: '12:18:05', level: 'ERROR', service: 'rds', message: 'Full Table Scan on batch query (missing index on order_id)' },
        { timestamp: '12:20:00', level: 'WARN', service: 'graphql-gateway', message: 'GetUserDashboard p95 reduced to 2100ms but still exceeds SLA (1000ms)' }
      ],
      learningMoment: {
        title: 'DataLoader + Index는 함께 적용해야 함',
        explanation: 'GraphQL DataLoader는 **N+1 쿼리를 배치 쿼리로 전환**하여 네트워크 왕복을 줄입니다. 하지만:\n\n1. **인덱스가 없으면** 배치 쿼리도 Full Table Scan 실행\n2. **WHERE order_id IN (...)** 쿼리가 1.2M 행 전체를 스캔\n3. **쿼리 수는 줄었지만 각 쿼리가 여전히 느림**\n\n**완전한 해결책**: DataLoader로 N+1 제거 **+** order_id 인덱스 추가로 쿼리 성능 개선. 두 가지를 모두 적용해야 합니다.',
        moduleReference: 'Module 8: 느린 쿼리로 인한 CPU 급등'
      },
      redirectTo: 'step-4a',
      redirectMessage: 'DataLoader만으로는 부족합니다. 인덱스 추가가 필요합니다. RDS 분석으로 돌아가세요.'
    },

    'step-4c-deadend': {
      title: 'RDS 인스턴스 업그레이드 — 비용만 증가, 문제 미해결',
      description: 'RDS를 db.r6g.xlarge에서 db.r6g.2xlarge로 업그레이드했지만, Full Table Scan은 계속되며 응답시간은 3,200ms → 2,800ms로 소폭 개선에 그쳤습니다. CPU는 68% → 42%로 낮아졌지만, 근본 원인인 **missing index**는 해결되지 않았습니다. 월 비용은 2배 증가했습니다.',
      isDeadEnd: true,
      metrics: [
        {
          title: '@resource.duration after RDS upgrade',
          chartType: 'bar',
          chartConfig: {
            labels: ['Before (r6g.xlarge)', 'After (r6g.2xlarge)', 'SLA'],
            datasets: [
              {
                label: 'p95 Response Time (ms)',
                data: [3200, 2800, 1000],
                backgroundColor: ['#ef4444', '#f59e0b', '#22c55e']
              }
            ]
          }
        },
        {
          title: 'Monthly Cost',
          chartType: 'bar',
          chartConfig: {
            labels: ['r6g.xlarge', 'r6g.2xlarge'],
            datasets: [
              {
                label: 'Monthly Cost ($)',
                data: [580, 1160],
                backgroundColor: ['#22c55e', '#ef4444']
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '12:25:00', level: 'INFO', service: 'rds', message: 'Instance upgraded to db.r6g.2xlarge' },
        { timestamp: '12:30:00', level: 'WARN', service: 'rds', message: 'Full Table Scan still occurring on order_items' },
        { timestamp: '12:32:00', level: 'INFO', service: 'rds', message: 'CPU reduced to 42%, but select_latency still 2600ms' },
        { timestamp: '12:35:00', level: 'ERROR', service: 'rds', message: 'Missing index on order_id not resolved by instance upgrade' }
      ],
      learningMoment: {
        title: '인프라 확장 vs 쿼리 최적화',
        explanation: 'RDS 인스턴스 업그레이드는 **CPU/메모리 부족**을 해결합니다. 하지만 현재 문제는:\n\n1. **Missing index로 인한 Full Table Scan**\n2. **CPU가 아니라 쿼리 실행 계획이 비효율적**\n3. **하드웨어를 늘려도 쿼리 패턴은 변하지 않음**\n\n인스턴스 업그레이드는 **속도를 약간 높일 뿐**, 근본 원인을 해결하지 않습니다. **올바른 접근**: EXPLAIN ANALYZE로 인덱스 누락을 확인하고 인덱스를 추가해야 합니다. 비용 대비 효과가 훨씬 높습니다.',
        moduleReference: 'Module 8: 느린 쿼리로 인한 CPU 급등'
      },
      redirectTo: 'step-4a',
      redirectMessage: 'RDS 업그레이드는 임시방편입니다. 인덱스 추가가 근본 해결책입니다.'
    },

    'step-final': {
      title: '문제 해결 완료 — 인덱스 추가 + DataLoader 적용',
      description: 'order_items.order_id에 인덱스를 추가하고, GraphQL DataLoader를 적용하여 N+1 쿼리를 배치 쿼리로 전환했습니다. GetUserDashboard의 p95 응답시간은 3,200ms → 280ms로 개선되었으며, RDS select_latency도 2,800ms → 35ms로 정상화되었습니다.',
      isTerminal: true,
      metrics: [
        {
          title: '@resource.duration (Before vs After)',
          chartType: 'line',
          chartConfig: {
            labels: ['10:30', '11:00', '11:15 (Issue)', '12:40 (Index)', '12:50 (DataLoader)', '13:00', '13:15'],
            datasets: [
              {
                label: 'p95 Response Time (ms)',
                data: [380, 410, 3200, 850, 320, 280, 275],
                borderColor: '#22c55e',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                tension: 0.4
              }
            ]
          }
        },
        {
          title: 'aws.rds.select_latency',
          chartType: 'line',
          chartConfig: {
            labels: ['10:30', '11:00', '11:15', '12:40', '12:50', '13:00', '13:15'],
            datasets: [
              {
                label: 'select_latency p95 (ms)',
                data: [48, 52, 2800, 220, 42, 35, 32],
                borderColor: '#22c55e',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                tension: 0.4
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '12:40:00', level: 'INFO', service: 'rds', message: 'Index created: CREATE INDEX idx_order_items_order_id ON order_items(order_id)' },
        { timestamp: '12:42:00', level: 'INFO', service: 'rds', message: 'EXPLAIN ANALYZE: Index scan on idx_order_items_order_id (0.05s per query)' },
        { timestamp: '12:50:00', level: 'INFO', service: 'graphql-gateway', message: 'DataLoader deployed: v3.2.1' },
        { timestamp: '12:52:00', level: 'INFO', service: 'graphql-gateway', message: 'GetUserDashboard p95: 320ms (within SLA)' },
        { timestamp: '13:00:00', level: 'INFO', service: 'graphql-gateway', message: 'GetUserDashboard p95: 280ms (stable)' },
        { timestamp: '13:05:00', level: 'INFO', service: 'monitoring', message: 'Incident P2-2024-04-10 resolved' }
      ],
      rootCause: {
        title: 'GraphQL API 성능 회귀 — Missing Index + N+1 쿼리',
        summary: 'v3.2.0 배포에서 order_items 테이블 마이그레이션 시 order_id 인덱스를 재생성하지 않아, GetUserDashboard resolver의 N+1 쿼리 패턴에서 Full Table Scan이 발생했습니다. 75번의 개별 쿼리가 각각 2,800ms 소요되며 총 응답시간 3,200ms를 기록했습니다.',
        timeline: [
          { time: '11:00', event: 'v3.2.0 배포 — order_items 테이블에 variant_id 컬럼 추가 마이그레이션 실행' },
          { time: '11:05', event: 'Migration script에서 인덱스 재생성 단계 누락 (ALTER TABLE만 실행)' },
          { time: '11:15', event: 'RUM에서 @resource.duration p95 급등 감지 (380ms → 3,200ms)' },
          { time: '11:32', event: 'RUM operationName 분석 → GetUserDashboard 병목 확인' },
          { time: '11:55', event: 'APM trace 분석 → N+1 쿼리 패턴 발견 (75번 개별 쿼리)' },
          { time: '12:10', event: 'RDS EXPLAIN ANALYZE → order_items Full Table Scan 확인 (missing index)' },
          { time: '12:40', event: 'order_items.order_id 인덱스 추가 → select_latency 2,800ms → 220ms' },
          { time: '12:50', event: 'GraphQL DataLoader 배포 (v3.2.1) → N+1 쿼리 배치로 전환' },
          { time: '13:00', event: 'GetUserDashboard p95 280ms 안정화 (SLA 1,000ms 이내)' }
        ],
        resolution: [
          '[즉시 조치] order_items.order_id에 인덱스 추가: CREATE INDEX idx_order_items_order_id',
          '[즉시 조치] GraphQL DataLoader 적용하여 N+1 쿼리를 배치 쿼리로 전환 (v3.2.1)',
          '[즉시 조치] GetUserDashboard p95 응답시간 3,200ms → 280ms 개선 확인',
          '[장기 대책] DB 마이그레이션 체크리스트에 인덱스 재생성 단계 필수화',
          '[장기 대책] Pre-production 환경에서 APM trace 기반 성능 회귀 테스트 자동화',
          '[장기 대책] GraphQL schema 변경 시 N+1 쿼리 패턴 정적 분석 도구 도입',
          '[장기 대책] RDS slow query log를 Datadog으로 전송하여 missing index 조기 감지'
        ]
      },
      postMortem: {
        whatWentWell: [
          'RUM에서 배포 시점과 응답시간 급등의 상관관계를 즉시 파악',
          'operationName별 세분화로 GetUserDashboard 병목을 빠르게 식별',
          'APM trace 분석으로 N+1 쿼리 패턴을 정확히 진단',
          'RDS EXPLAIN ANALYZE로 missing index를 확인하여 근본 원인 해결'
        ],
        whatWentWrong: [
          'DB 마이그레이션 script에서 인덱스 재생성 단계 누락',
          'Pre-production 환경에서 성능 회귀 테스트 미흡 (운영 트래픽 패턴 미반영)',
          'GraphQL resolver에서 N+1 쿼리 패턴 정적 분석 도구 부재',
          'RDS slow query log 모니터링이 활성화되지 않아 배포 직후 조기 감지 실패'
        ],
        lessonsLearned: [
          '**APM-centric Investigation**: RUM은 증상 파악, APM trace는 근본 원인 진단에 필수',
          '**Index + Query Pattern 동시 해결**: 인덱스 추가와 N+1 해결을 함께 적용해야 완전한 성능 개선',
          '**Migration Checklist**: ALTER TABLE 후 인덱스/제약조건 재생성 자동 검증 필요',
          '**Performance Regression Testing**: 운영 트래픽 패턴을 반영한 부하 테스트 필수',
          '**RDS Monitoring**: slow query log + missing index 감지를 배포 파이프라인에 통합'
        ]
      }
    }
  }
};
