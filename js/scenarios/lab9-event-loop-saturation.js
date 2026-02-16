var SCENARIO_LAB9 = {
  id: 'lab9-event-loop-saturation',
  title: 'Node.js Event Loop Saturation',
  difficulty: 'advanced',

  alert: {
    severity: 'critical',
    source: 'Datadog Monitor',
    timestamp: '2024-05-03 16:28:45 KST',
    title: '[P1] GraphQL Gateway — Event Loop Delay > 500ms',
    message: 'GraphQL Gateway의 event loop delay가 500ms를 초과했습니다. 전체 API 응답시간이 급등하고 있으며, 요청 큐가 쌓이고 있습니다.',
    metric: {
      name: 'runtime.node.event_loop.delay.avg',
      value: '520',
      unit: 'ms',
      threshold: '100'
    },
    tags: ['service:graphql-gateway', 'env:production', 'runtime:nodejs', 'severity:p1']
  },

  briefing: {
    description: '오후 4시경부터 GraphQL Gateway의 모든 API 응답시간이 점진적으로 느려지더니, 4시 25분을 기점으로 급격히 악화되었습니다. 특정 operation이 아닌 모든 요청이 영향을 받고 있습니다. Pod CPU 사용률은 85% 부근이지만, 전통적인 CPU 과부하 패턴과는 다른 양상을 보입니다.',
    environment: {
      services: [
        'graphql-gateway (Node.js 18, 4 pods)',
        'user-service',
        'order-service',
        'RDS Aurora MySQL'
      ],
      infra: 'EKS (Node.js pods: 2 CPU, 4GB memory), RDS Aurora',
      monitoring: 'Datadog APM + Node.js Runtime Metrics + RDS Integration'
    }
  },

  optimalPath: ['step-1', 'step-2a', 'step-3a', 'step-4a', 'step-final'],

  scoring: {
    gradeThresholds: {
      S: { maxExtraSteps: 0, maxHints: 0, label: 'Expert SRE' },
      A: { maxExtraSteps: 2, maxHints: 1, label: 'Proficient' },
      B: { maxExtraSteps: 4, maxHints: 2, label: 'Developing' },
      C: { maxExtraSteps: Infinity, maxHints: Infinity, label: 'Learning' }
    }
  },

  steps: {
    'step-1': {
      title: '전체 API 응답시간 확인',
      description: '먼저 GraphQL Gateway의 전체적인 API 응답시간 패턴을 확인합니다. 특정 operation만 느린지, 아니면 모든 요청이 영향을 받는지 파악해야 합니다.',

      metrics: [
        {
          title: 'API 응답시간 및 요청 큐 추이',
          chartType: 'line',
          chartConfig: {
            labels: ['16:00', '16:05', '16:10', '16:15', '16:20', '16:25', '16:30'],
            datasets: [
              {
                label: 'trace.graphql.server.request.duration p99 (ms)',
                data: [120, 145, 180, 220, 280, 890, 1450],
                borderColor: 'rgb(239, 68, 68)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.3
              },
              {
                label: 'runtime.node.process.active_requests',
                data: [8, 12, 18, 25, 38, 125, 245],
                borderColor: 'rgb(251, 191, 36)',
                backgroundColor: 'rgba(251, 191, 36, 0.1)',
                tension: 0.3,
                yAxisID: 'y1'
              }
            ]
          }
        }
      ],

      logs: [
        { timestamp: '16:28:12', level: 'WARN', service: 'graphql-gateway', message: 'Event loop blocked for 520ms - request queue growing' },
        { timestamp: '16:28:18', level: 'ERROR', service: 'graphql-gateway', message: 'Health check timeout: event loop not responsive within 1000ms' },
        { timestamp: '16:28:25', level: 'WARN', service: 'graphql-gateway', message: 'Request queue depth: 245 (threshold: 50)' },
        { timestamp: '16:28:30', level: 'INFO', service: 'graphql-gateway', message: 'All GraphQL operations experiencing increased latency - not operation-specific' },
        { timestamp: '16:28:42', level: 'ERROR', service: 'kubernetes', message: 'Readiness probe failed for pod graphql-gateway-7b9c4f8d-x5k2p' }
      ],

      choices: [
        {
          text: 'Node.js 런타임 메트릭 확인 (event loop delay, GC pause)',
          isOptimal: true,
          feedback: '✅ 올바른 접근입니다. 모든 operation이 느려지는 현상은 특정 쿼리 문제가 아닌 런타임 레벨 문제를 시사합니다. Event loop delay와 GC 메트릭을 확인해야 합니다.',
          nextStep: 'step-2a'
        },
        {
          text: '개별 GraphQL operation별 성능 분석',
          isOptimal: false,
          feedback: '⚠️ 로그에서 "All GraphQL operations experiencing increased latency - not operation-specific"라고 명시되어 있습니다. 특정 operation 문제가 아니라 전체 런타임 문제입니다.',
          nextStep: 'step-2b'
        },
        {
          text: 'HPA로 Pod 스케일아웃 실행',
          isOptimal: false,
          feedback: '⚠️ CPU가 85%로 높긴 하지만, 요청 큐가 쌓이는 패턴이 일반적인 CPU 과부하와 다릅니다. 근본 원인을 먼저 파악해야 합니다.',
          nextStep: 'step-2c-deadend'
        }
      ],

      hint: '💡 분석 방향: 특정 operation이 아닌 모든 API가 느려진다면 개별 쿼리 문제가 아닙니다. Node.js는 single-thread event loop 모델이므로, event loop이 블로킹되면 모든 요청이 영향을 받습니다. 런타임 메트릭을 확인하세요.'
    },

    'step-2a': {
      title: 'Event Loop Delay 및 GC Pause 분석',
      description: 'Node.js 런타임 메트릭을 확인합니다. Event loop delay와 GC pause 시간이 급증하고 있는지 파악합니다.',

      metrics: [
        {
          title: 'Event Loop Delay 및 GC Pause 추이',
          chartType: 'line',
          chartConfig: {
            labels: ['16:00', '16:05', '16:10', '16:15', '16:20', '16:25', '16:30'],
            datasets: [
              {
                label: 'runtime.node.event_loop.delay.avg (ms)',
                data: [8, 12, 22, 45, 85, 520, 680],
                borderColor: 'rgb(239, 68, 68)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.3
              },
              {
                label: 'runtime.node.event_loop.delay.max (ms)',
                data: [25, 38, 65, 120, 220, 850, 1200],
                borderColor: 'rgb(220, 38, 38)',
                backgroundColor: 'rgba(220, 38, 38, 0.1)',
                tension: 0.3,
                borderDash: [5, 5]
              },
              {
                label: 'runtime.node.gc.pause.avg (ms)',
                data: [5, 8, 12, 25, 45, 180, 280],
                borderColor: 'rgb(251, 191, 36)',
                backgroundColor: 'rgba(251, 191, 36, 0.1)',
                tension: 0.3,
                yAxisID: 'y1'
              }
            ]
          }
        }
      ],

      logs: [
        { timestamp: '16:28:05', level: 'WARN', service: 'graphql-gateway', message: 'Event loop lag detected: avg=520ms, max=850ms (threshold: 100ms)' },
        { timestamp: '16:28:12', level: 'WARN', service: 'graphql-gateway', message: 'GC pause: 180ms (major GC - old generation)' },
        { timestamp: '16:28:18', level: 'ERROR', service: 'graphql-gateway', message: 'Event loop blocked: tick took 680ms to complete' },
        { timestamp: '16:28:25', level: 'WARN', service: 'graphql-gateway', message: 'GC activity increased: 12 major collections in last minute' },
        { timestamp: '16:28:30', level: 'INFO', service: 'graphql-gateway', message: 'runtime.node.event_loop.delay.avg breached critical threshold (500ms)' }
      ],

      choices: [
        {
          text: 'Heap 메모리 사용량 및 active handles 분석',
          isOptimal: true,
          feedback: '✅ 정확합니다. Event loop delay와 GC pause가 동시에 증가하는 것은 메모리 압박 + CPU-bound 작업을 시사합니다. Heap 메모리와 active handles를 확인해야 합니다.',
          nextStep: 'step-3a'
        },
        {
          text: 'GC 튜닝 (--max-old-space-size 증가)',
          isOptimal: false,
          feedback: '⚠️ GC pause가 길어지는 것은 증상일 뿐, 근본 원인이 아닙니다. 왜 GC가 빈번하게 발생하는지(큰 객체가 생성되는지) 먼저 파악해야 합니다.',
          nextStep: 'step-3b-deadend'
        }
      ],

      hint: '💡 Event Loop Delay의 의미: Event loop delay가 500ms+라는 것은 Node.js가 다음 I/O 이벤트를 처리하기까지 500ms 이상 걸린다는 뜻입니다. 이는 동기적인 CPU-bound 작업이 event loop을 블로킹하고 있다는 강력한 신호입니다.'
    },

    'step-2b': {
      title: '개별 Operation 분석 결과',
      description: '개별 GraphQL operation을 분석한 결과, 모든 operation이 비례적으로 느려지고 있습니다. 특정 쿼리 문제가 아님을 확인했습니다.',

      metrics: [
        {
          title: 'Operation별 응답시간 비교',
          chartType: 'bar',
          chartConfig: {
            labels: ['getUser', 'listOrders', 'getProduct', 'searchItems', 'getReport', 'updateCart'],
            datasets: [
              {
                label: '정상 시 응답시간 (ms)',
                data: [45, 120, 80, 150, 180, 60],
                backgroundColor: 'rgba(34, 197, 94, 0.7)'
              },
              {
                label: '현재 응답시간 (ms)',
                data: [850, 1120, 1050, 1280, 1450, 920],
                backgroundColor: 'rgba(239, 68, 68, 0.7)'
              }
            ]
          }
        }
      ],

      logs: [
        { timestamp: '16:29:15', level: 'INFO', service: 'graphql-gateway', message: 'Operation analysis: all operations showing 8-12x latency increase' },
        { timestamp: '16:29:22', level: 'INFO', service: 'graphql-gateway', message: 'No operation-specific bottleneck detected - system-wide degradation' },
        { timestamp: '16:29:28', level: 'WARN', service: 'graphql-gateway', message: 'Pattern suggests runtime-level blocking, not query-specific issue' }
      ],

      choices: [
        {
          text: 'Node.js 런타임 메트릭으로 돌아가기',
          isOptimal: true,
          feedback: '✅ 맞습니다. 모든 operation이 균등하게 느려지는 것은 GraphQL 레이어 문제가 아닌 Node.js 런타임 문제입니다.',
          nextStep: 'step-2a'
        }
      ],

      hint: '💡 패턴 인식: 모든 operation이 비슷한 비율로 느려진다면 특정 resolver나 쿼리 문제가 아닙니다. 하위 레이어(런타임)에서 모든 요청을 블로킹하는 무언가가 있습니다.'
    },

    'step-2c-deadend': {
      title: '막다른 길: HPA 스케일아웃',
      description: 'Pod를 4개에서 8개로 스케일아웃했지만, 각 Pod의 응답시간은 개선되지 않았습니다. 새로운 Pod들도 동일한 event loop delay 문제를 겪고 있습니다.',
      isDeadEnd: true,

      metrics: [
        {
          title: '스케일아웃 후 Event Loop Delay 변화',
          chartType: 'line',
          chartConfig: {
            labels: ['16:30', '16:32', '16:34', '16:36', '16:38', '16:40'],
            datasets: [
              {
                label: 'Pod 개수',
                data: [4, 6, 8, 8, 8, 8],
                borderColor: 'rgb(59, 130, 246)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                yAxisID: 'y1'
              },
              {
                label: 'Event Loop Delay (avg, ms)',
                data: [680, 650, 620, 640, 660, 675],
                borderColor: 'rgb(239, 68, 68)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.3
              }
            ]
          }
        }
      ],

      logs: [
        { timestamp: '16:32:45', level: 'INFO', service: 'kubernetes', message: 'HPA scaled graphql-gateway from 4 to 8 pods' },
        { timestamp: '16:35:12', level: 'WARN', service: 'graphql-gateway-new-pod', message: 'Event loop lag detected on new pod: 620ms' },
        { timestamp: '16:37:30', level: 'ERROR', service: 'graphql-gateway', message: 'Scale-out did not resolve latency - all pods experiencing same blocking pattern' }
      ],

      learningMoment: {
        title: '왜 스케일아웃이 소용없었나?',
        explanation: 'Node.js는 single-thread event loop 모델입니다. 각 Pod 내에서 event loop을 블로킹하는 동기 작업이 있다면, Pod를 아무리 많이 늘려도 각 Pod는 동일한 블로킹을 겪습니다. CPU-bound 작업이 event loop을 블로킹하는 경우, worker threads를 사용하거나 코드를 수정해야 합니다. 스케일아웃은 요청 분산에는 유용하지만, 각 Pod 내부의 런타임 블로킹은 해결하지 못합니다.',
        moduleReference: 'Module 9: Node.js Runtime Monitoring 섹션 참고'
      },

      redirectTo: 'step-1',
      redirectMessage: '근본 원인을 찾기 위해 처음으로 돌아갑니다.'
    },

    'step-3a': {
      title: 'Heap 메모리 및 Active Handles 분석',
      description: 'Node.js의 heap 메모리 사용량과 active handles를 분석합니다. 메모리 압박과 비동기 작업 패턴을 확인합니다.',

      metrics: [
        {
          title: 'Heap 메모리 및 Active Handles 추이',
          chartType: 'line',
          chartConfig: {
            labels: ['16:00', '16:05', '16:10', '16:15', '16:20', '16:25', '16:30'],
            datasets: [
              {
                label: 'runtime.node.mem.heap_used (GB)',
                data: [1.2, 1.5, 1.8, 2.2, 2.8, 3.2, 3.5],
                borderColor: 'rgb(168, 85, 247)',
                backgroundColor: 'rgba(168, 85, 247, 0.1)',
                tension: 0.3
              },
              {
                label: 'runtime.node.mem.heap_total (GB)',
                data: [2.0, 2.0, 2.5, 3.0, 3.5, 4.0, 4.0],
                borderColor: 'rgb(139, 92, 246)',
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                borderDash: [5, 5],
                tension: 0.3
              },
              {
                label: 'runtime.node.process.active_handles',
                data: [45, 52, 68, 95, 145, 380, 520],
                borderColor: 'rgb(251, 191, 36)',
                backgroundColor: 'rgba(251, 191, 36, 0.1)',
                tension: 0.3,
                yAxisID: 'y1'
              }
            ]
          }
        }
      ],

      logs: [
        { timestamp: '16:27:45', level: 'WARN', service: 'graphql-gateway', message: 'Heap usage spike: 3.2GB (80% of limit)' },
        { timestamp: '16:28:05', level: 'ERROR', service: 'graphql-gateway', message: 'Heap snapshot analysis: large JSON serialization detected (estimated 120MB object)' },
        { timestamp: '16:28:18', level: 'WARN', service: 'graphql-gateway', message: 'Active handles count: 380 (normal: <100) - indicates queued async operations' },
        { timestamp: '16:28:30', level: 'ERROR', service: 'graphql-gateway', message: 'CPU profile shows JSON.stringify blocking event loop for 450ms' },
        { timestamp: '16:28:42', level: 'INFO', service: 'graphql-gateway', message: 'Pattern: large synchronous operation on main thread detected' }
      ],

      choices: [
        {
          text: 'CPU Profile 및 코드 분석으로 blocking 원인 특정',
          isOptimal: true,
          feedback: '✅ 완벽합니다. 로그에서 "JSON.stringify blocking event loop for 450ms"라는 구체적인 단서가 있습니다. 어떤 코드가 대형 JSON을 동기적으로 직렬화하는지 찾아야 합니다.',
          nextStep: 'step-4a'
        },
        {
          text: '메모리 리밋 증가 (4GB → 8GB)',
          isOptimal: false,
          feedback: '⚠️ 메모리 부족이 문제가 아닙니다. Heap이 증가하는 것은 큰 객체가 생성되고 있다는 증상일 뿐, 근본 원인은 왜 그 큰 객체가 생성되는지입니다.',
          nextStep: 'step-3c-deadend'
        }
      ],

      hint: '💡 Heap과 Event Loop의 관계: Heap에 큰 객체가 있으면 GC가 오래 걸리고, 동기적으로 큰 데이터를 처리하면 event loop이 블로킹됩니다. "JSON.stringify blocking" 로그가 핵심 단서입니다.'
    },

    'step-3b-deadend': {
      title: '막다른 길: GC 튜닝',
      description: '--max-old-space-size를 4096에서 8192로 증가시켰지만, event loop delay는 여전합니다. GC pause는 일시적으로 개선되었으나, 문제의 본질은 해결되지 않았습니다.',
      isDeadEnd: true,

      metrics: [
        {
          title: 'GC 튜닝 후 메트릭 변화',
          chartType: 'line',
          chartConfig: {
            labels: ['16:30', '16:32', '16:34', '16:36', '16:38', '16:40'],
            datasets: [
              {
                label: 'GC Pause (ms)',
                data: [180, 150, 120, 140, 160, 155],
                borderColor: 'rgb(251, 191, 36)',
                backgroundColor: 'rgba(251, 191, 36, 0.1)',
                tension: 0.3
              },
              {
                label: 'Event Loop Delay (ms)',
                data: [680, 650, 640, 660, 675, 690],
                borderColor: 'rgb(239, 68, 68)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.3
              }
            ]
          }
        }
      ],

      logs: [
        { timestamp: '16:32:15', level: 'INFO', service: 'graphql-gateway', message: 'Applied --max-old-space-size=8192' },
        { timestamp: '16:34:30', level: 'INFO', service: 'graphql-gateway', message: 'GC pause improved: avg 140ms (was 180ms)' },
        { timestamp: '16:36:45', level: 'ERROR', service: 'graphql-gateway', message: 'Event loop delay unchanged: still 660ms avg' },
        { timestamp: '16:38:20', level: 'WARN', service: 'graphql-gateway', message: 'GC tuning only addressed symptom, not root cause of blocking' }
      ],

      learningMoment: {
        title: 'GC 튜닝의 한계',
        explanation: 'GC pause가 길어지는 것은 heap에 큰 객체가 있다는 신호입니다. GC 설정을 바꾸는 것은 증상을 일시적으로 완화할 수 있지만, 근본 원인(왜 큰 객체가 생성되는가)을 해결하지는 못합니다. Event loop delay는 GC와는 별개로, 동기적 CPU-bound 작업이 원인일 가능성이 높습니다. 메모리 할당량을 늘리는 대신, 어떤 코드가 큰 객체를 만들고 동기적으로 처리하는지 찾아야 합니다.',
        moduleReference: 'Module 9: Node.js Runtime Monitoring - GC 메트릭 해석 섹션 참고'
      },

      redirectTo: 'step-3a',
      redirectMessage: '근본 원인을 찾기 위해 코드 분석으로 돌아갑니다.'
    },

    'step-3c-deadend': {
      title: '막다른 길: 메모리 리밋 증가',
      description: '메모리 리밋을 4GB에서 8GB로 증가시켰지만, event loop delay와 응답시간은 개선되지 않았습니다. 메모리 부족이 아닌 CPU-bound blocking이 문제입니다.',
      isDeadEnd: true,

      metrics: [
        {
          title: '메모리 증가 후 메트릭 변화',
          chartType: 'line',
          chartConfig: {
            labels: ['16:30', '16:32', '16:34', '16:36', '16:38', '16:40'],
            datasets: [
              {
                label: 'Heap Used (GB)',
                data: [3.5, 3.6, 3.8, 4.0, 4.2, 4.5],
                borderColor: 'rgb(168, 85, 247)',
                backgroundColor: 'rgba(168, 85, 247, 0.1)',
                tension: 0.3
              },
              {
                label: 'Event Loop Delay (ms)',
                data: [680, 670, 665, 680, 690, 685],
                borderColor: 'rgb(239, 68, 68)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.3,
                yAxisID: 'y1'
              }
            ]
          }
        }
      ],

      logs: [
        { timestamp: '16:32:00', level: 'INFO', service: 'kubernetes', message: 'Updated memory limit: 4Gi → 8Gi' },
        { timestamp: '16:34:20', level: 'INFO', service: 'graphql-gateway', message: 'Heap growth continues: 4.0GB used' },
        { timestamp: '16:36:40', level: 'ERROR', service: 'graphql-gateway', message: 'Event loop delay unchanged: memory was not the bottleneck' },
        { timestamp: '16:38:10', level: 'WARN', service: 'graphql-gateway', message: 'Synchronous CPU-bound operation still blocking event loop' }
      ],

      learningMoment: {
        title: '메모리 vs CPU Blocking',
        explanation: 'Heap 메모리가 증가하는 것과 event loop이 블로킹되는 것은 별개의 문제입니다. 메모리 부족이 아니라 "큰 데이터를 동기적으로 처리"하는 것이 문제입니다. CPU profile 로그에서 JSON.stringify가 450ms 동안 event loop을 블로킹한다는 단서가 있었습니다. 메모리를 늘리는 것이 아니라, 어떤 코드가 그렇게 큰 데이터를 동기적으로 직렬화하는지 찾아야 합니다.',
        moduleReference: 'Module 9: Event Loop Blocking 진단 섹션 참고'
      },

      redirectTo: 'step-3a',
      redirectMessage: 'CPU Profile과 코드 분석으로 돌아갑니다.'
    },

    'step-4a': {
      title: '근본 원인 특정: 대규모 보고서 API의 동기 JSON 직렬화',
      description: 'CPU profile과 코드 리뷰 결과, 최근 추가된 `/api/analytics/report` 엔드포인트가 100MB+ 크기의 데이터를 JSON.stringify()로 동기 직렬화하고 있음을 발견했습니다. 이 작업이 event loop을 450ms+ 블로킹하여 모든 API 요청을 지연시켰습니다.',

      metrics: [
        {
          title: '배포 이후 Event Loop Delay 변화',
          chartType: 'line',
          chartConfig: {
            labels: ['배포 전', '배포 직후', '1주 후', '2주 후', '핫픽스 전', '핫픽스 후'],
            datasets: [
              {
                label: 'Event Loop Delay (ms)',
                data: [8, 15, 85, 280, 680, 12],
                borderColor: 'rgb(239, 68, 68)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.3
              },
              {
                label: 'P99 Response Time (ms)',
                data: [120, 150, 280, 550, 1450, 135],
                borderColor: 'rgb(99, 102, 241)',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                tension: 0.3,
                yAxisID: 'y1'
              }
            ]
          }
        }
      ],

      logs: [
        { timestamp: '16:29:30', level: 'INFO', service: 'sre-team', message: 'Code review: /api/analytics/report added 2 weeks ago' },
        { timestamp: '16:30:15', level: 'ERROR', service: 'graphql-gateway', message: 'CPU profile: JSON.stringify() in reportResolver.ts consuming 450ms per call' },
        { timestamp: '16:31:00', level: 'INFO', service: 'sre-team', message: 'Root cause: synchronous serialization of 100MB+ analytics dataset' },
        { timestamp: '16:32:45', level: 'INFO', service: 'sre-team', message: 'Code snippet: const json = JSON.stringify(allAnalyticsData); // 120MB object, blocking' },
        { timestamp: '16:45:00', level: 'INFO', service: 'sre-team', message: 'Hotfix deployed: stream-based JSON serialization + cursor pagination' },
        { timestamp: '16:48:30', level: 'INFO', service: 'graphql-gateway', message: 'Event loop delay recovered: 12ms avg (was 680ms)' },
        { timestamp: '16:50:00', level: 'INFO', service: 'graphql-gateway', message: 'All API response times back to normal baseline' }
      ],

      choices: [
        {
          text: '스트리밍 직렬화 + 페이지네이션 적용하여 해결',
          isOptimal: true,
          feedback: '✅ 완벽한 해결책입니다. 대형 데이터를 한 번에 직렬화하는 대신, 스트리밍으로 나누어 전송하고 페이지네이션으로 클라이언트가 필요한 만큼만 요청하도록 변경하면 event loop blocking을 방지할 수 있습니다.',
          nextStep: 'step-final'
        }
      ],

      hint: '💡 해결 전략: 큰 데이터를 동기적으로 처리하는 것이 문제라면: 1) 스트리밍으로 청크 단위 전송, 2) 페이지네이션으로 데이터 크기 제한, 3) Worker threads로 CPU-bound 작업 분리, 4) 캐싱으로 반복 계산 방지 등의 방법을 조합할 수 있습니다.'
    },

    'step-final': {
      title: '사후 분석 및 재발 방지',
      description: '근본 원인을 해결하고 시스템이 정상화되었습니다. 사후 분석 보고서를 작성합니다.',
      isTerminal: true,

      rootCause: {
        title: 'Node.js Event Loop Saturation',
        summary: '최근 추가된 대규모 보고서 API 엔드포인트(`/api/analytics/report`)에서 100MB+ 크기의 분석 데이터를 `JSON.stringify()`로 동기 직렬화하면서 event loop을 450ms 이상 블로킹. 해당 API 사용량이 점진적으로 증가하면서 blocking이 누적되어, 결국 모든 API 요청이 지연되고 전체 서비스가 마비됨.',

        timeline: [
          { time: '4월 19일', event: '대규모 보고서 API 배포 (초기 사용량 낮음)' },
          { time: '4월 26일', event: '보고서 기능 홍보 시작, 사용량 점진적 증가' },
          { time: '5월 3일 16:00', event: 'Event loop delay 점진적 상승 시작 (15ms→85ms)' },
          { time: '16:20', event: 'Event loop delay 급증 (280ms), GC pause 증가' },
          { time: '16:25', event: '임계점 도달 - event loop delay 680ms, 전체 API 응답 지연' },
          { time: '16:28', event: '[P1] 알림 발생: Event Loop Delay > 500ms' },
          { time: '16:30', event: 'CPU profile 분석 시작, JSON.stringify blocking 발견' },
          { time: '16:45', event: '핫픽스 배포: 스트리밍 직렬화 + 페이지네이션' },
          { time: '16:48', event: 'Event loop delay 정상화 (12ms), 전체 API 복구' }
        ],

        resolution: [
          '[즉시 조치] 스트리밍 JSON 직렬화 적용 (stream-json 라이브러리)',
          '[즉시 조치] Cursor 기반 페이지네이션 구현 (limit: 1000 rows)',
          '[즉시 조치] 보고서 API에 rate limiting 추가 (10 req/min per user)',
          '[즉시 조치] Event loop delay 모니터 임계치 강화 (100ms → WARN, 200ms → CRITICAL)',
          '[중기 개선] CPU-intensive 작업을 Worker threads로 분리',
          '[중기 개선] 대형 보고서 사전 생성 + S3 캐싱 (1시간 TTL)',
          '[중기 개선] Streaming API 가이드라인 문서화 및 코드 리뷰 체크리스트 추가',
          '[중기 개선] Node.js runtime 메트릭 대시보드 확장 (event loop, GC, heap)',
          '[장기 대책] 모든 대용량 API에 스트리밍 패턴 적용 감사',
          '[장기 대책] Event loop delay 기반 자동 circuit breaker 구현',
          '[장기 대책] Load test에 event loop delay 검증 추가',
          '[장기 대책] 개발팀 대상 "Node.js Event Loop 최적화" 워크샵 진행'
        ]
      },

      postMortem: {
        template: {
          fields: [
            {
              label: '장애 감지부터 원인 특정까지 걸린 시간',
              type: 'duration',
              value: '17분 (16:28 알림 → 16:45 핫픽스)'
            },
            {
              label: '가장 유용했던 메트릭 Top 3',
              type: 'list',
              value: [
                'runtime.node.event_loop.delay.avg (블로킹 패턴 발견)',
                'runtime.node.gc.pause (메모리 압박 신호)',
                'CPU profile (동기 작업 특정)'
              ]
            },
            {
              label: '초기 오판 및 학습 포인트',
              type: 'text',
              value: 'CPU 사용률 85%만 보고 일반적인 과부하로 판단하여 HPA 스케일아웃 시도 → 실패. Event loop delay 메트릭이 핵심 단서였음. Node.js는 single-thread이므로 Pod 수와 무관하게 각 Pod 내 blocking 문제를 해결해야 함.'
            },
            {
              label: '재발 방지를 위한 핵심 액션',
              type: 'text',
              value: '1) 모든 대용량 응답 API에 스트리밍/페이지네이션 적용, 2) 코드 리뷰 시 동기 직렬화 체크리스트 추가, 3) Event loop delay 모니터링 강화 및 자동 알림'
            },
            {
              label: '이 장애를 통해 배운 것',
              type: 'text',
              value: 'Node.js에서는 "얼마나 많은 요청"을 처리하느냐보다 "각 요청이 event loop을 얼마나 블로킹하느냐"가 더 중요. Event loop delay는 응답시간보다 선행 지표로 활용 가능.'
            }
          ]
        }
      }
    }
  }
};
