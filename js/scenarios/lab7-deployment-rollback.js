/**
 * Lab 7: Deployment Rollback 판단 시나리오
 *
 * 상황: 수요일 오후 2시, 카나리 배포(10% 트래픽) 후 혼합 신호 발생.
 * 근본 원인: API 응답 필드 이름 변경(snake_case → camelCase)으로 일부 프론트엔드 페이지에서 JS 에러 발생.
 */
var SCENARIO_LAB7 = {
  id: 'lab7-deployment-rollback',
  title: 'Deployment Rollback 판단',
  difficulty: 'expert',

  alert: {
    severity: 'warning',
    source: 'Canary Deployment Monitor',
    timestamp: '2024-03-20 14:15:42 KST',
    title: '[P2] Canary 배포 혼합 신호 감지',
    message: 'api-service v3.5.0 카나리 배포(10% 트래픽)에서 에러율이 0.5%로 증가했으나, p99 레이턴시는 250ms → 200ms로 개선되었습니다. RUM에서 특정 페이지의 JS 에러가 증가하고 있습니다.',
    metric: {
      name: 'canary.error_rate',
      value: '0.5',
      unit: '%',
      threshold: '0.1'
    },
    tags: ['service:api-service', 'env:production', 'deployment:canary', 'version:v3.5.0', 'severity:p2']
  },

  briefing: {
    description: '수요일 오후 2시, api-service v3.5.0의 카나리 배포가 완료되었습니다. 자동 모니터링에서 혼란스러운 신호가 감지되었습니다: 에러율은 높아졌지만 레이턴시는 개선되었습니다. 당신은 SRE 엔지니어로서 100% 롤아웃을 진행할지, 롤백할지 판단해야 합니다.',
    environment: {
      services: ['api-service v3.4.2 (stable, 90% 트래픽)', 'api-service v3.5.0 (canary, 10% 트래픽)', 'frontend-app', 'mobile-app'],
      infra: 'EKS (canary: 2 pods, stable: 18 pods), ALB with weighted target groups, CloudFront CDN',
      monitoring: 'Datadog APM + RUM (Real User Monitoring) + Synthetics'
    }
  },

  optimalPath: ['step-1', 'step-2a', 'step-3a', 'step-4a', 'step-final'],

  scoring: {
    gradeThresholds: {
      S: { maxExtraSteps: 0, maxHints: 0, label: 'Senior SRE' },
      A: { maxExtraSteps: 1, maxHints: 1, label: 'Proficient' },
      B: { maxExtraSteps: 3, maxHints: 2, label: 'Developing' },
      C: { maxExtraSteps: Infinity, maxHints: Infinity, label: 'Learning' }
    }
  },

  steps: {
    // ============================================================
    // Step 1: 카나리 배포 대시보드 - 혼합 신호 분석
    // ============================================================
    'step-1': {
      title: '카나리 배포 대시보드 확인',
      description: 'Datadog Canary Analysis 대시보드에서 v3.5.0(canary)과 v3.4.2(stable)을 비교합니다. 에러율은 canary가 5배 높지만, p99 레이턴시는 오히려 20% 개선되었습니다. 이는 모순된 신호로 보입니다.',
      metrics: [
        {
          title: 'Error Rate Comparison (canary vs stable)',
          chartType: 'bar',
          chartConfig: {
            labels: ['14:00-14:05', '14:05-14:10', '14:10-14:15', '14:15-14:20'],
            datasets: [{
              label: 'v3.5.0 Canary Error Rate (%)',
              data: [0.48, 0.52, 0.50, 0.51],
              backgroundColor: 'rgba(239, 68, 68, 0.7)',
              borderColor: '#ef4444',
              borderWidth: 1
            }, {
              label: 'v3.4.2 Stable Error Rate (%)',
              data: [0.09, 0.10, 0.11, 0.10],
              backgroundColor: 'rgba(74, 222, 128, 0.5)',
              borderColor: '#4ade80',
              borderWidth: 1
            }]
          }
        },
        {
          title: 'p99 Latency Comparison (ms)',
          chartType: 'line',
          chartConfig: {
            labels: ['14:00', '14:05', '14:10', '14:15', '14:20'],
            datasets: [{
              label: 'v3.5.0 Canary p99 (ms)',
              data: [198, 202, 200, 199, 201],
              borderColor: '#f97316',
              backgroundColor: 'rgba(249, 115, 22, 0.1)',
              fill: true,
              tension: 0.3
            }, {
              label: 'v3.4.2 Stable p99 (ms)',
              data: [248, 251, 250, 252, 249],
              borderColor: '#6366f1',
              backgroundColor: 'rgba(99, 102, 241, 0.1)',
              fill: true,
              tension: 0.3,
              borderDash: [5, 5]
            }]
          }
        }
      ],
      logs: [
        { timestamp: '14:15:42', level: 'WARN', source: 'canary-monitor', message: 'Canary deployment v3.5.0: error_rate=0.51% (baseline=0.10%, threshold=0.30%) - THRESHOLD EXCEEDED' },
        { timestamp: '14:15:42', level: 'INFO', source: 'canary-monitor', message: 'Canary deployment v3.5.0: p99_latency=200ms (baseline=250ms) - IMPROVED by 20%' },
        { timestamp: '14:15:43', level: 'WARN', source: 'datadog-rum', message: 'RUM alert: JavaScript error rate increased on /dashboard and /profile pages (canary traffic)' },
        { timestamp: '14:15:45', level: 'INFO', source: 'canary-monitor', message: 'Canary traffic: 10% (2/20 pods), stable traffic: 90% (18/20 pods)' },
        { timestamp: '14:15:50', level: 'INFO', source: 'canary-monitor', message: 'Success rate: canary=99.49%, stable=99.90% - delta: -0.41%' }
      ],
      hint: '혼합 신호가 나타날 때는 "어떤 종류의 에러인지" 구체적으로 확인해야 합니다. 레이턴시 개선은 긍정적이지만, 에러율 증가는 사용자 영향을 의미할 수 있습니다. RUM에서 특정 페이지에만 JS 에러가 발생한다는 단서를 주목하세요.',
      choices: [
        {
          text: 'RUM 에러 상세 분석 (어떤 에러가 어디서 발생하는지)',
          isOptimal: true,
          feedback: '정확한 판단입니다! 레이턴시 개선에도 불구하고 에러율이 높다는 것은 기능적 결함을 의미할 수 있습니다. 에러의 구체적 내용을 파악하는 것이 롤백 여부 판단의 핵심입니다.',
          nextStep: 'step-2a'
        },
        {
          text: 'latency가 개선되었으니 100% rollout 진행 (에러는 무시)',
          isOptimal: false,
          isDeadEnd: true,
          feedback: '위험한 판단입니다! 레이턴시 개선은 긍정적이지만, 에러율 5배 증가는 기능적 버그를 의미할 수 있습니다. 100% 롤아웃 시 JS 에러가 전체 사용자에게 전파됩니다.',
          nextStep: 'step-2b-deadend'
        },
        {
          text: '즉시 롤백 (에러율 임계값 초과했으므로)',
          isOptimal: false,
          feedback: '보수적인 판단이지만 최적은 아닙니다. 에러의 구체적 원인과 영향 범위를 파악하지 않고 롤백하면 학습 기회를 상실하고, 다음 배포에서도 같은 문제가 재발할 수 있습니다. 먼저 에러 내용을 확인하세요.',
          nextStep: 'step-2c'
        }
      ]
    },

    // ============================================================
    // Step 2a: RUM 에러 상세 분석 (최적 경로)
    // ============================================================
    'step-2a': {
      title: 'RUM JavaScript Error 분석',
      description: 'Datadog RUM에서 canary 트래픽의 에러 상세를 확인합니다. /dashboard와 /profile 페이지에서 "Cannot read property \'user_name\' of undefined" 에러가 반복 발생하고 있습니다. 이는 프론트엔드가 API 응답에서 snake_case 필드명(user_name)을 참조하려다 실패한 것으로 보입니다.',
      metrics: [
        {
          title: 'RUM Error Distribution by Page',
          chartType: 'doughnut',
          chartConfig: {
            labels: ['/dashboard', '/profile', '/settings', '/home', 'other'],
            datasets: [{
              data: [58, 35, 0, 0, 7],
              backgroundColor: [
                'rgba(239, 68, 68, 0.8)',
                'rgba(249, 115, 22, 0.7)',
                'rgba(99, 102, 241, 0.3)',
                'rgba(74, 222, 128, 0.3)',
                'rgba(156, 163, 175, 0.3)'
              ],
              borderColor: '#1f2937',
              borderWidth: 2
            }]
          }
        },
        {
          title: 'JS Error Trend (canary traffic only)',
          chartType: 'line',
          chartConfig: {
            labels: ['14:00', '14:05', '14:10', '14:15', '14:20'],
            datasets: [{
              label: 'JS Errors (/min)',
              data: [0, 2, 12, 15, 14],
              borderColor: '#ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              fill: true,
              tension: 0.3
            }]
          }
        }
      ],
      logs: [
        { timestamp: '14:16:00', level: 'ERROR', source: 'rum-browser', message: 'Uncaught TypeError: Cannot read property "user_name" of undefined at UserProfile.render (profile.js:42)' },
        { timestamp: '14:16:01', level: 'ERROR', source: 'rum-browser', message: 'Uncaught TypeError: Cannot read property "user_name" of undefined at Dashboard.loadUser (dashboard.js:128)' },
        { timestamp: '14:16:02', level: 'INFO', source: 'rum-analytics', message: 'Error impact: 93 affected users out of 1,850 canary users (5.0%), 0 errors in stable traffic' },
        { timestamp: '14:16:05', level: 'INFO', source: 'rum-analytics', message: 'Error pattern: only occurs when API response comes from v3.5.0 canary pods' },
        { timestamp: '14:16:10', level: 'WARN', source: 'rum-analytics', message: 'Field reference mismatch suspected: frontend expects snake_case, canary API returns camelCase' }
      ],
      hint: 'JS 에러가 특정 페이지에서만 발생하고, "user_name" 필드를 읽지 못한다는 것은 API 응답 필드명이 변경되었을 가능성이 큽니다. v3.5.0에서 API 응답 구조가 변경되었는지 확인해야 합니다.',
      choices: [
        {
          text: 'API 응답 변경점 확인 + backward compatibility 체크',
          isOptimal: true,
          feedback: '완벽한 판단입니다! API 필드명 변경이 의심되므로, v3.5.0의 변경사항과 하위 호환성 여부를 확인하는 것이 근본 원인을 찾는 핵심입니다.',
          nextStep: 'step-3a'
        },
        {
          text: '프론트엔드 에러는 소수 사용자에게만 영향이므로 무시하고 진행',
          isOptimal: false,
          isDeadEnd: true,
          feedback: '매우 위험한 판단입니다! 현재 10% 트래픽(canary)에서 5% 에러율이면, 100% 롤아웃 시 모든 /dashboard, /profile 사용자가 영향을 받습니다. 이는 핵심 기능의 장애를 의미합니다.',
          nextStep: 'step-3b-deadend'
        }
      ]
    },

    // ============================================================
    // Step 2b: Dead End - 100% Rollout
    // ============================================================
    'step-2b-deadend': {
      title: '막다른 길: 100% Rollout 강행',
      isDeadEnd: true,
      description: '레이턴시 개선을 근거로 100% 롤아웃을 진행했습니다. 10분 후, /dashboard와 /profile 페이지에서 대량의 JS 에러가 발생하며 사용자들이 프로필 정보를 볼 수 없게 되었습니다. P1 장애가 발생하여 긴급 롤백을 실행해야 합니다.',
      learningMoment: {
        title: '성능 개선과 기능 결함의 트레이드오프',
        explanation: '레이턴시 개선은 성능 지표이지만, 에러율 증가는 기능적 결함을 의미할 수 있습니다. 특히 RUM에서 특정 페이지의 JS 에러가 감지된 경우, 이는 API 계약 변경(breaking change)을 나타내는 강력한 신호입니다. 카나리 배포의 목적은 소수 사용자에게 먼저 노출하여 문제를 조기 발견하는 것입니다. 혼합 신호가 나타날 때는 "최악의 시나리오"(에러가 전체 확산)를 먼저 고려해야 합니다. 성능은 점진적으로 개선할 수 있지만, 기능 장애는 즉각적인 사용자 불만을 유발합니다.',
        moduleReference: 'Module 6: Dashboard 설계에서 핵심 지표 우선순위를 복습하세요.'
      },
      redirectTo: 'step-1',
      redirectMessage: '카나리 대시보드로 돌아가서 다시 분석'
    },

    // ============================================================
    // Step 2c: 즉시 롤백 (비최적 경로)
    // ============================================================
    'step-2c': {
      title: '보수적 판단: 즉시 롤백',
      description: '에러율 임계값 초과를 근거로 즉시 롤백을 실행했습니다. 서비스는 안전하게 v3.4.2로 복구되었지만, 왜 에러가 발생했는지, 다음 배포에서 어떻게 방지할지에 대한 정보가 없습니다.',
      logs: [
        { timestamp: '14:17:00', level: 'INFO', source: 'kubectl', message: 'Rolling back deployment api-service to v3.4.2...' },
        { timestamp: '14:17:30', level: 'INFO', source: 'canary-monitor', message: 'Rollback complete. All traffic on v3.4.2 stable.' },
        { timestamp: '14:17:35', level: 'INFO', source: 'datadog', message: 'Error rate normalized to 0.10%' },
        { timestamp: '14:17:40', level: 'WARN', source: 'dev-team', message: 'Rollback reason unclear. What should we fix before next deployment?' }
      ],
      choices: [
        {
          text: '롤백은 완료했지만, 근본 원인 분석을 위해 이전 단계로 돌아가기',
          isOptimal: true,
          feedback: '현명한 판단입니다. 롤백으로 즉시 위험은 제거했지만, 다음 배포를 위해 근본 원인을 파악해야 합니다. RUM 에러 상세를 확인하세요.',
          nextStep: 'step-1'
        }
      ]
    },

    // ============================================================
    // Step 3a: API 변경점 확인 (최적 경로)
    // ============================================================
    'step-3a': {
      title: 'API 응답 변경점 분석',
      description: 'v3.5.0 릴리스 노트와 API 응답 diff를 확인합니다. /api/users/{id} 엔드포인트의 응답이 snake_case → camelCase로 변경되었습니다(user_name → userName, created_at → createdAt). 이는 코드 컨벤션 통일을 위한 변경이었으나, backward compatibility 체크를 누락했습니다.',
      metrics: [
        {
          title: 'API Response Field Changes',
          chartType: 'bar',
          chartConfig: {
            labels: ['/api/users/{id}', '/api/users/profile', '/api/users/settings', '/api/orders', '/api/payments'],
            datasets: [{
              label: 'Changed Fields (count)',
              data: [8, 6, 0, 0, 0],
              backgroundColor: ['rgba(239, 68, 68, 0.7)', 'rgba(249, 115, 22, 0.6)', 'rgba(99, 102, 241, 0.3)', 'rgba(99, 102, 241, 0.3)', 'rgba(99, 102, 241, 0.3)'],
              borderColor: '#ef4444',
              borderWidth: 1
            }]
          }
        },
        {
          title: 'Frontend Page Compatibility Status',
          chartType: 'doughnut',
          chartConfig: {
            labels: ['Incompatible (/dashboard, /profile)', 'Compatible (/settings, /home)', 'Not using user API'],
            datasets: [{
              data: [2, 2, 8],
              backgroundColor: [
                'rgba(239, 68, 68, 0.8)',
                'rgba(74, 222, 128, 0.7)',
                'rgba(99, 102, 241, 0.5)'
              ],
              borderColor: '#1f2937',
              borderWidth: 2
            }]
          }
        }
      ],
      logs: [
        { timestamp: '14:18:00', level: 'INFO', source: 'git-diff', message: 'v3.5.0 changelog: "Unified API response format to camelCase for consistency with frontend conventions"' },
        { timestamp: '14:18:01', level: 'WARN', source: 'api-schema-diff', message: 'Breaking changes detected: user_name → userName, created_at → createdAt, updated_at → updatedAt, is_active → isActive (8 fields total)' },
        { timestamp: '14:18:02', level: 'ERROR', source: 'compatibility-check', message: 'Backward compatibility: FAILED - no deprecated field aliases provided' },
        { timestamp: '14:18:05', level: 'INFO', source: 'frontend-analysis', message: 'Pages using old field names: dashboard.js (user_name, created_at), profile.js (user_name, is_active, updated_at)' },
        { timestamp: '14:18:10', level: 'INFO', source: 'latency-analysis', message: 'Latency improvement root cause: new JSON serialization library (jackson-faster) - 20% faster than old jackson-databind' }
      ],
      hint: 'API 변경은 정당한 개선이었지만(camelCase 통일 + 빠른 serializer), backward compatibility를 고려하지 않았습니다. 올바른 전략은: (1) 롤백 후 프론트엔드를 먼저 수정하거나, (2) API에 deprecated 필드 추가(기술부채). 장기적으로는 (1)이 올바릅니다.',
      choices: [
        {
          text: '판단: 롤백 → 프론트엔드 호환성 수정 후 재배포 (근본 해결)',
          isOptimal: true,
          feedback: '완벽한 판단입니다! API 변경은 정당하므로 유지하되, 프론트엔드가 새 필드명을 사용하도록 수정한 후 동시 배포하는 것이 올바른 해결책입니다. 이는 기술부채를 만들지 않습니다.',
          nextStep: 'step-4a'
        },
        {
          text: 'API에 deprecated 필드 추가 (user_name = userName 별칭)',
          isOptimal: false,
          feedback: '동작은 하지만 기술부채를 만듭니다. deprecated 필드는 영구히 유지되거나, 나중에 제거할 때 또 다른 breaking change를 유발합니다. 프론트엔드를 수정하는 것이 더 깨끗한 해결책입니다.',
          nextStep: 'step-4b'
        }
      ]
    },

    // ============================================================
    // Step 3b: Dead End - 에러 무시
    // ============================================================
    'step-3b-deadend': {
      title: '막다른 길: 소수 에러 무시',
      isDeadEnd: true,
      description: '5% 에러율을 "acceptable한 수준"으로 판단하고 100% 롤아웃을 진행했습니다. 롤아웃 후 /dashboard와 /profile 페이지가 전체 사용자에게 작동하지 않아 P0 장애가 발생했습니다. 고객 지원팀에 수백 건의 문의가 쇄도하고, 긴급 롤백과 공개 사과문이 필요합니다.',
      learningMoment: {
        title: '카나리 에러율의 진짜 의미',
        explanation: 'Canary 10% 트래픽에서 5% 에러율은 "전체 사용자의 0.5%"가 아니라 "canary를 사용하는 사용자 중 5%"를 의미합니다. 100% 롤아웃 시 이 에러율이 그대로 전파되므로, 특정 기능(dashboard, profile)을 사용하는 모든 사용자가 영향을 받습니다. 특히 JS 에러는 페이지 전체를 망가뜨리므로, 1% 이하의 에러율도 심각하게 받아들여야 합니다. 카나리 배포의 원칙: "에러는 zero-tolerance, 성능은 점진적 개선".',
        moduleReference: 'Module 6: Dashboard 설계에서 에러율과 성능 지표의 우선순위를 복습하세요.'
      },
      redirectTo: 'step-2a',
      redirectMessage: 'RUM 에러 분석으로 돌아가서 다시 조사'
    },

    // ============================================================
    // Step 4a: 롤백 + 프론트엔드 수정 계획 (최적 경로)
    // ============================================================
    'step-4a': {
      title: '롤백 실행 및 재배포 계획',
      description: 'v3.5.0을 롤백하고, 프론트엔드 팀과 협업하여 camelCase 필드명 대응 코드를 작성합니다. API와 프론트엔드를 동시에 배포하는 coordinated deployment 계획을 수립합니다.',
      metrics: [
        {
          title: 'Rollback Execution Timeline',
          chartType: 'line',
          chartConfig: {
            labels: ['14:20', '14:22', '14:24', '14:26', '14:28', '14:30'],
            datasets: [{
              label: 'Canary Traffic %',
              data: [10, 10, 5, 0, 0, 0],
              borderColor: '#f97316',
              backgroundColor: 'rgba(249, 115, 22, 0.1)',
              fill: true,
              tension: 0.3
            }, {
              label: 'Error Rate %',
              data: [0.51, 0.50, 0.28, 0.10, 0.09, 0.10],
              borderColor: '#4ade80',
              backgroundColor: 'rgba(74, 222, 128, 0.1)',
              fill: true,
              tension: 0.3
            }]
          }
        }
      ],
      logs: [
        { timestamp: '14:20:00', level: 'INFO', source: 'kubectl', message: 'Initiating rollback: api-service v3.5.0 → v3.4.2' },
        { timestamp: '14:20:30', level: 'INFO', source: 'canary-monitor', message: 'Reducing canary traffic: 10% → 5%' },
        { timestamp: '14:21:00', level: 'INFO', source: 'canary-monitor', message: 'Canary traffic: 0% (rollback complete)' },
        { timestamp: '14:21:05', level: 'INFO', source: 'datadog', message: 'Error rate normalized: 0.10% (stable baseline)' },
        { timestamp: '14:22:00', level: 'INFO', source: 'frontend-team', message: 'Creating PR: Update user API field references (snake_case → camelCase)' },
        { timestamp: '14:25:00', level: 'INFO', source: 'sre-team', message: 'Deployment plan: coordinated release of api-service v3.5.1 + frontend-app v2.8.0 with compatibility tests' }
      ],
      hint: '롤백은 완료했지만, 재발 방지를 위한 프로세스 개선이 필요합니다. API 변경 시 backward compatibility 체크리스트와 카나리 에러율 기반 자동 롤백을 설정해야 합니다.',
      choices: [
        {
          text: '재발 방지: API 변경 체크리스트 + 카나리 자동 롤백 기준 설정',
          isOptimal: true,
          feedback: '완벽합니다! 프로세스를 개선하여 (1) API breaking change 체크리스트, (2) 카나리 에러율 > 2배 시 자동 롤백, (3) coordinated deployment 워크플로우를 도입하면 재발을 방지할 수 있습니다.',
          nextStep: 'step-final'
        }
      ]
    },

    // ============================================================
    // Step 4b: Deprecated 필드 추가 (차선책)
    // ============================================================
    'step-4b': {
      title: 'Deprecated 필드 추가 (기술부채)',
      description: 'API에 deprecated 필드를 추가하여 user_name과 userName을 모두 반환하도록 수정합니다. 즉시 해결되지만, API 응답 크기가 증가하고 향후 필드 제거 시 또 다른 breaking change가 발생합니다.',
      logs: [
        { timestamp: '14:22:00', level: 'INFO', source: 'api-team', message: 'Adding deprecated fields: user_name (alias for userName), created_at (alias for createdAt)...' },
        { timestamp: '14:25:00', level: 'INFO', source: 'deployment', message: 'Deploying api-service v3.5.1 with backward compatibility layer' },
        { timestamp: '14:28:00', level: 'WARN', source: 'code-review', message: 'Technical debt created: 8 deprecated fields must be maintained indefinitely or removed in future breaking release' },
        { timestamp: '14:30:00', level: 'INFO', source: 'datadog', message: 'Canary deployment v3.5.1: error_rate=0.09%, compatible with old frontend' }
      ],
      choices: [
        {
          text: '동작은 하지만 기술부채 발생. 장기 계획: 프론트엔드 수정 후 deprecated 필드 제거',
          isOptimal: true,
          feedback: '현실적인 판단입니다. 단기적으로 동작하도록 하되, 장기 roadmap에 프론트엔드 수정과 deprecated 필드 제거를 포함시키는 것이 중요합니다.',
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
        title: 'API Breaking Change (snake_case → camelCase) 미검증',
        summary: 'api-service v3.5.0에서 API 응답 필드를 snake_case → camelCase로 변경했으나, backward compatibility 체크를 누락했습니다. 프론트엔드의 /dashboard, /profile 페이지가 여전히 구 필드명(user_name)을 참조하여 JS 에러가 발생했습니다. 카나리 배포에서 혼합 신호(에러율 증가 + latency 개선)가 나타났으며, 올바른 판단은 롤백 후 프론트엔드 호환성 수정 후 재배포입니다.',
        timeline: [
          { time: '13:00', event: 'api-service v3.5.0 배포 시작 (camelCase 통일 + jackson-faster 도입)' },
          { time: '14:00', event: 'Canary 배포 완료 (10% 트래픽)' },
          { time: '14:05', event: 'RUM에서 JS 에러 감지 시작 (/dashboard, /profile)' },
          { time: '14:10', event: 'Canary monitor에서 에러율 임계값 초과 감지 (0.51% vs baseline 0.10%)' },
          { time: '14:15', event: 'P2 알림 발생: 혼합 신호 (에러율 ↑, latency ↓)' },
          { time: '14:18', event: 'RUM 분석: API 필드명 변경으로 인한 JS 에러 확인' },
          { time: '14:20', event: '판단: 롤백 실행 (v3.5.0 → v3.4.2)' },
          { time: '14:21', event: '롤백 완료, 에러율 정상화' },
          { time: '14:25', event: '프론트엔드 수정 계획 수립 (coordinated deployment)' }
        ],
        resolution: [
          '즉시 대응: v3.5.0 롤백 (canary → 0% 트래픽)',
          '단기 대책: 프론트엔드 코드에서 camelCase 필드 참조로 변경',
          '중기 대책: API + 프론트엔드 coordinated deployment (v3.5.1 + v2.8.0 동시 배포)',
          '장기 대책: API contract testing 도입 (Pact, schema validation)',
          '프로세스: API breaking change 체크리스트 (OpenAPI diff, deprecated field strategy)',
          '모니터링: 카나리 에러율 > 2x baseline 시 자동 롤백 설정'
        ]
      },
      postMortem: {
        template: {
          fields: [
            {
              label: '1. 장애 요약 (한 줄)',
              placeholder: '예: API 응답 필드 변경으로 인한 프론트엔드 JS 에러 발생, 카나리 배포 단계에서 감지하여 롤백'
            },
            {
              label: '2. 영향 범위 및 롤백 판단 근거',
              placeholder: '예: canary 사용자 중 5% 에러 발생 (/dashboard, /profile). 100% 롤아웃 시 전체 확산 예상되어 롤백 결정. Latency 개선에도 불구하고 기능 결함을 우선 고려.'
            },
            {
              label: '3. 롤백 판단 기준 (Decision Criteria)',
              placeholder: '예: 에러율 > 2x baseline AND 에러가 핵심 페이지에 집중 → 롤백. Latency 개선은 기능 결함 대비 우선순위 낮음. 혼합 신호 발생 시 "최악 시나리오" 우선 고려.'
            },
            {
              label: '4. 근본 원인',
              placeholder: '예: API breaking change (snake_case → camelCase) 배포 전 backward compatibility 검증 누락'
            },
            {
              label: '5. 재발 방지 계획 (프로세스)',
              placeholder: '예: API contract testing 도입, breaking change 체크리스트, coordinated deployment 워크플로우, 카나리 자동 롤백 기준 설정'
            }
          ]
        }
      }
    }
  }
};
