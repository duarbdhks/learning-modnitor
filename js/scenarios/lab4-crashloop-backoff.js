/* ========================================
   Lab 4: CrashLoopBackOff
   ConfigMap 오류로 인한 auth-service 장애 시나리오
   ======================================== */

var SCENARIO_LAB4 = {
  title: 'CrashLoopBackOff 장애 분석',
  difficulty: 'intermediate',
  estimatedMinutes: 18,
  prerequisiteModules: [4],
  tags: ['Kubernetes', 'CrashLoopBackOff', 'ConfigMap', 'YAML', 'Configuration'],

  alert: {
    severity: 'critical',
    source: 'Datadog Monitors',
    title: 'auth-service 전체 Pod 비정상 - 서비스 중단',
    message: 'auth-service의 모든 Pod(0/3)가 Ready 상태가 아닙니다. Error Rate가 100%에 도달했으며, 인증 서비스가 완전히 중단되었습니다. 모든 API 요청에서 인증 실패가 발생하고 있습니다.',
    timestamp: '2024-04-08 11:15:00 KST',
    tags: ['env:production', 'service:auth-service', 'k8s_namespace:platform', 'severity:p1', 'team:platform'],
    metric: {
      name: 'kubernetes_state.deployment.replicas_available',
      value: 0,
      unit: 'pods',
      threshold: 1
    }
  },

  briefing: {
    description: 'auth-service는 JWT 토큰 발급 및 검증을 담당하는 핵심 인증 서비스입니다. 약 10분 전 ConfigMap을 업데이트한 이후 모든 Pod가 CrashLoopBackOff 상태에 빠졌습니다. auth-service가 중단되면서 다른 모든 마이크로서비스의 API 호출이 인증 실패(401)를 반환하고 있어 전체 서비스에 영향을 미치고 있습니다.',
    environment: {
      services: ['auth-service (Node.js 20, Express)', 'api-gateway', 'user-service', 'Redis (session store)'],
      infra: 'EKS 1.28 / 노드: m5.large x 4 / Deployment replicas: 3',
      monitoring: 'Datadog Agent + APM + Log Management'
    }
  },

  steps: {
    'step-1': {
      id: 'step-1',
      title: '알림 확인 및 초기 대응 방향 결정',
      description: 'auth-service가 완전히 중단되었습니다. 모든 Pod가 Ready 상태가 아니며, Error Rate가 100%입니다. 서비스 전체에 영향을 주고 있으므로 빠른 원인 파악이 필요합니다.',
      metrics: [
        {
          title: 'Pod Ready Count & Error Rate',
          chartType: 'line',
          chartConfig: {
            labels: ['11:00', '11:02', '11:04', '11:06', '11:08', '11:10', '11:12', '11:14'],
            datasets: [
              {
                label: 'Ready Pods (/ 3)',
                data: [3, 3, 3, 0, 0, 0, 0, 0],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true,
                tension: 0.3
              },
              {
                label: 'Error Rate (%)',
                data: [0, 0, 0.5, 100, 100, 100, 100, 100],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                fill: true,
                tension: 0.3
              }
            ]
          }
        },
        {
          title: 'Request Count (rpm)',
          chartType: 'line',
          chartConfig: {
            labels: ['11:00', '11:02', '11:04', '11:06', '11:08', '11:10', '11:12', '11:14'],
            datasets: [{
              label: 'Requests/min',
              data: [1200, 1180, 1150, 0, 0, 0, 0, 0],
              borderColor: '#8b5cf6',
              backgroundColor: 'rgba(139, 92, 246, 0.1)',
              fill: true,
              tension: 0.3
            }]
          }
        }
      ],
      logs: [
        { timestamp: '11:05:12', level: 'ERROR', source: 'datadog-monitor', message: 'ALERT: auth-service available replicas dropped to 0 (threshold: >= 1)' },
        { timestamp: '11:05:15', level: 'ERROR', source: 'api-gateway', message: 'Upstream auth-service: no healthy endpoints, returning 503 to all requests' },
        { timestamp: '11:05:18', level: 'ERROR', source: 'user-service', message: 'Authentication failed: connection refused to auth-service:8080' },
        { timestamp: '11:05:20', level: 'ERROR', source: 'datadog-monitor', message: 'ALERT: auth-service error_rate = 100% (threshold: > 5%)' }
      ],
      choices: [
        {
          text: 'kubectl get pods로 Pod 상태 확인',
          nextStep: 'step-2a',
          isOptimal: true,
          feedback: '좋은 선택입니다! Pod 상태를 먼저 확인하면 CrashLoopBackOff, ImagePullBackOff 등 구체적인 실패 유형을 바로 파악할 수 있습니다.'
        },
        {
          text: '최근 변경 사항(배포, 설정 변경) 확인',
          nextStep: 'step-2b',
          isOptimal: false,
          feedback: '최근 변경 사항을 확인하는 것도 좋은 접근입니다. 변경과 장애의 상관관계를 빠르게 파악할 수 있습니다.'
        },
        {
          text: 'kubectl rollout undo로 Deployment 즉시 롤백',
          nextStep: 'step-2-deadend-rollback',
          isOptimal: false,
          isDeadEnd: true,
          feedback: '원인을 파악하지 않고 롤백하면, 이번 경우처럼 Deployment 변경이 아닌 ConfigMap 변경이 원인일 때 문제가 해결되지 않습니다.'
        }
      ],
      hint: '서비스가 완전히 중단된 긴급 상황입니다. 먼저 Pod의 현재 상태를 확인하여 어떤 종류의 에러가 발생하고 있는지 파악하세요.'
    },

    'step-2a': {
      id: 'step-2a',
      title: 'Pod 상태 확인 - CrashLoopBackOff',
      description: '<code>kubectl get pods</code> 결과, 모든 Pod가 <strong>CrashLoopBackOff</strong> 상태입니다. Restart Count가 빠르게 증가하고 있으며, 이는 컨테이너가 시작 직후 크래시하고 Kubernetes가 재시작을 반복하면서 대기 시간(backoff)이 기하급수적으로 늘어나는 상태입니다.',
      metrics: [
        {
          title: 'Container Restart Count',
          chartType: 'line',
          chartConfig: {
            labels: ['11:05', '11:06', '11:07', '11:08', '11:09', '11:10', '11:12', '11:14'],
            datasets: [{
              label: 'Restart Count',
              data: [0, 1, 3, 7, 15, 20, 25, 31],
              borderColor: '#ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              fill: true,
              tension: 0.3
            }]
          }
        }
      ],
      logs: [
        { timestamp: '11:10:00', level: 'ERROR', source: 'kubectl', message: 'NAME                            READY   STATUS             RESTARTS   AGE' },
        { timestamp: '11:10:00', level: 'ERROR', source: 'kubectl', message: 'auth-service-5f8d7c4b6-abc12   0/1     CrashLoopBackOff   15         10m' },
        { timestamp: '11:10:00', level: 'ERROR', source: 'kubectl', message: 'auth-service-5f8d7c4b6-def34   0/1     CrashLoopBackOff   14         10m' },
        { timestamp: '11:10:00', level: 'ERROR', source: 'kubectl', message: 'auth-service-5f8d7c4b6-ghi56   0/1     CrashLoopBackOff   13         10m' },
        { timestamp: '11:10:05', level: 'INFO', source: 'kubectl', message: 'describe pod: Back-off restarting failed container, backoff 5m0s' }
      ],
      choices: [
        {
          text: 'kubectl logs로 Pod 크래시 로그 확인',
          nextStep: 'step-3a',
          isOptimal: true,
          feedback: '정확합니다! CrashLoopBackOff의 원인을 파악하려면 컨테이너 로그를 확인해야 합니다. 크래시 직전에 어떤 에러가 발생했는지 알 수 있습니다.'
        },
        {
          text: 'kubectl delete pod로 모든 Pod 삭제 후 재생성',
          nextStep: 'step-2-deadend-delete',
          isOptimal: false,
          isDeadEnd: true,
          feedback: 'Pod를 삭제해도 Deployment가 동일한 설정으로 새 Pod를 생성하므로 같은 에러가 반복됩니다.'
        }
      ],
      hint: 'CrashLoopBackOff는 컨테이너가 시작 후 바로 종료되는 것을 의미합니다. 왜 종료되는지 알려면 컨테이너의 로그(stdout/stderr)를 확인해야 합니다. kubectl logs --previous 옵션으로 이전 크래시의 로그를 볼 수 있습니다.'
    },

    'step-2b': {
      id: 'step-2b',
      title: '최근 변경 사항 확인',
      description: '최근 변경 사항을 조사한 결과, 약 10분 전에 <strong>auth-service의 ConfigMap이 업데이트</strong>된 것을 발견했습니다. DevOps 팀에서 Redis 연결 설정을 변경하면서 ConfigMap의 YAML을 수정했습니다. Deployment 자체에는 변경이 없었습니다.',
      logs: [
        { timestamp: '11:02:30', level: 'INFO', source: 'kubectl', message: 'rollout history: No recent Deployment changes' },
        { timestamp: '11:02:35', level: 'INFO', source: 'kubectl', message: 'Last Deployment revision: 28 (2024-04-01, image: auth-service:v3.5.2)' },
        { timestamp: '11:03:00', level: 'INFO', source: 'audit-log', message: 'ConfigMap "auth-service-config" updated by user park.ops@company.com at 11:04:30' },
        { timestamp: '11:03:05', level: 'INFO', source: 'audit-log', message: 'Change description: "Update Redis connection settings for new cluster"' }
      ],
      choices: [
        {
          text: 'Pod 로그를 확인하여 ConfigMap 변경이 원인인지 확인',
          nextStep: 'step-3a',
          isOptimal: true,
          feedback: '좋은 판단입니다! ConfigMap 변경 시점과 장애 시점이 일치하므로, Pod 로그에서 설정 파일 관련 에러를 확인합니다.'
        }
      ],
      hint: 'ConfigMap 업데이트 시점(11:04)과 Pod 비정상 시점(11:05)이 거의 일치합니다. ConfigMap 내용에 문제가 있을 수 있습니다.'
    },

    'step-2-deadend-rollback': {
      id: 'step-2-deadend-rollback',
      title: 'Deployment 롤백 - 효과 없음',
      description: '<code>kubectl rollout undo</code>로 Deployment를 이전 버전으로 롤백했지만, Pod는 여전히 CrashLoopBackOff 상태입니다. 이는 장애의 원인이 Deployment(컨테이너 이미지)가 아니라 <strong>ConfigMap</strong>에 있기 때문입니다. ConfigMap은 Deployment와 별도로 관리되므로, Deployment 롤백으로는 ConfigMap 변경이 되돌려지지 않습니다.',
      isDeadEnd: true,
      learningMoment: {
        title: 'ConfigMap/Secret은 Deployment 롤백에 포함되지 않습니다',
        explanation: 'Kubernetes에서 Deployment rollout undo는 Pod 템플릿(container image, env, resource 등)만 이전 버전으로 되돌립니다. ConfigMap이나 Secret은 별도의 리소스이므로 Deployment 롤백에 포함되지 않습니다. ConfigMap 변경으로 인한 장애는 ConfigMap 자체를 수정하거나 이전 버전으로 되돌려야 합니다. 이를 방지하려면 ConfigMap을 immutable하게 관리하고 이름에 해시를 포함시키는 GitOps 패턴을 사용하세요.',
        moduleReference: 'Module 4: Kubernetes 리소스 모니터링 - ConfigMap과 Secret 관리 참고'
      },
      redirectTo: 'step-1',
      redirectMessage: '다시 돌아가서 정확한 원인을 파악합니다'
    },

    'step-2-deadend-delete': {
      id: 'step-2-deadend-delete',
      title: 'Pod 삭제 - 동일한 에러 반복',
      description: '모든 Pod를 삭제했지만, Deployment 컨트롤러가 즉시 새로운 Pod를 생성합니다. 새로 생성된 Pod들도 동일한 ConfigMap을 마운트하므로 같은 에러로 CrashLoopBackOff에 빠집니다. 근본 원인을 수정하지 않으면 Pod를 몇 번 삭제해도 결과는 같습니다.',
      isDeadEnd: true,
      learningMoment: {
        title: 'Pod 삭제는 근본 해결이 아닙니다',
        explanation: 'Kubernetes의 Deployment 컨트롤러는 항상 desired state(원하는 replicas 수)를 유지하려고 합니다. Pod를 삭제하면 컨트롤러가 즉시 새 Pod를 생성합니다. 새 Pod도 동일한 설정(ConfigMap, Secret, 환경 변수)을 사용하므로, 설정에 문제가 있다면 동일한 에러가 반복됩니다. 먼저 로그를 통해 왜 크래시가 발생하는지 원인을 파악해야 합니다.',
        moduleReference: 'Module 4: Kubernetes 리소스 모니터링 - Pod 라이프사이클과 컨트롤러 참고'
      },
      redirectTo: 'step-2a',
      redirectMessage: 'Pod 상태 확인으로 돌아가서 로그를 분석합니다'
    },

    'step-3a': {
      id: 'step-3a',
      title: 'Pod 크래시 로그 분석',
      description: '<code>kubectl logs --previous</code>로 이전 크래시의 로그를 확인한 결과, 애플리케이션이 시작 시 설정 파일(<code>/etc/config/application.yaml</code>)을 로드하다 <strong>YAML 파싱 에러</strong>로 종료되고 있었습니다. ConfigMap에서 마운트된 YAML 파일에 구문 오류가 있습니다.',
      logs: [
        { timestamp: '11:10:15', level: 'INFO', source: 'auth-service', message: 'Starting auth-service v3.5.2...' },
        { timestamp: '11:10:15', level: 'INFO', source: 'auth-service', message: 'Loading configuration from /etc/config/application.yaml' },
        { timestamp: '11:10:16', level: 'ERROR', source: 'auth-service', message: 'YAMLException: bad indentation of a mapping entry at line 12, column 5:' },
        { timestamp: '11:10:16', level: 'ERROR', source: 'auth-service', message: '        host: redis-new-cluster.platform.svc.cluster.local' },
        { timestamp: '11:10:16', level: 'ERROR', source: 'auth-service', message: '    ^^^^^' },
        { timestamp: '11:10:16', level: 'ERROR', source: 'auth-service', message: 'Error: Failed to parse configuration file: /etc/config/application.yaml' },
        { timestamp: '11:10:16', level: 'ERROR', source: 'auth-service', message: 'Process exited with code 1' },
        { timestamp: '11:10:17', level: 'INFO', source: 'kubelet', message: 'Back-off restarting failed container auth in pod auth-service-5f8d7c4b6-abc12' }
      ],
      choices: [
        {
          text: 'ConfigMap 내용을 확인하여 YAML 오류 위치 파악',
          nextStep: 'step-4a',
          isOptimal: true,
          feedback: '정확합니다! 에러 메시지가 YAML 인덴테이션 오류를 가리키고 있으므로, ConfigMap의 실제 내용을 확인하여 어디에 오류가 있는지 정확히 파악합니다.'
        }
      ],
      hint: '에러 메시지에 "bad indentation of a mapping entry at line 12"라고 되어 있습니다. YAML에서 인덴테이션은 매우 중요합니다. ConfigMap의 실제 내용을 확인하세요.'
    },

    'step-4a': {
      id: 'step-4a',
      title: 'ConfigMap YAML 오류 확인',
      description: '<code>kubectl get configmap auth-service-config -o yaml</code>로 ConfigMap 내용을 확인한 결과, Redis 연결 설정 부분에서 <strong>YAML 인덴테이션 오류</strong>를 발견했습니다. <code>redis</code> 섹션의 하위 항목인 <code>host</code>가 잘못된 인덴테이션 레벨에 위치해 있습니다.',
      logs: [
        { timestamp: 'ConfigMap', level: 'INFO', source: 'auth-service-config', message: '--- application.yaml (현재 - 오류 있음) ---' },
        { timestamp: 'L1-5', level: 'INFO', source: 'yaml', message: 'server:\n  port: 8080\n  cors:\n    origins:\n      - "https://app.company.com"' },
        { timestamp: 'L6-8', level: 'INFO', source: 'yaml', message: 'jwt:\n  secret: ${JWT_SECRET}\n  expiration: 3600' },
        { timestamp: 'L9-14', level: 'ERROR', source: 'yaml', message: 'redis:\n  cluster: true\n    host: redis-new-cluster.platform.svc.cluster.local  # <-- 인덴테이션 오류!\n    port: 6379\n  password: ${REDIS_PASSWORD}\n  ttl: 1800' },
        { timestamp: 'Fix', level: 'INFO', source: 'yaml', message: '--- 수정된 버전 ---\nredis:\n  cluster: true\n  host: redis-new-cluster.platform.svc.cluster.local\n  port: 6379\n  password: ${REDIS_PASSWORD}\n  ttl: 1800' },
        { timestamp: 'Diff', level: 'WARN', source: 'diff', message: 'Line 12: "    host:" (4 spaces) should be "  host:" (2 spaces) - host is sibling of cluster, not child' }
      ],
      choices: [
        {
          text: 'ConfigMap YAML 수정 후 kubectl rollout restart로 Pod 재시작',
          nextStep: 'step-5a',
          isOptimal: true,
          feedback: '완벽합니다! ConfigMap의 YAML 인덴테이션 오류를 수정하고, Pod를 재시작하여 새 설정을 로드하도록 합니다. ConfigMap 수정 후에는 Pod를 재시작해야 변경 사항이 반영됩니다.'
        }
      ],
      hint: 'YAML에서 인덴테이션은 구조를 정의합니다. "host"가 "cluster"의 하위 항목이 아니라 같은 레벨의 형제 항목이어야 합니다. 인덴테이션을 2칸으로 맞추세요.'
    },

    'step-5a': {
      id: 'step-5a',
      title: 'ConfigMap 수정 및 서비스 복구',
      description: 'ConfigMap의 YAML 인덴테이션 오류를 수정하고 <code>kubectl rollout restart deployment/auth-service</code>로 Pod를 재시작했습니다. 모든 Pod가 정상적으로 시작되었고, 서비스가 복구되었습니다.',
      metrics: [
        {
          title: 'Pod Ready Count (복구)',
          chartType: 'line',
          chartConfig: {
            labels: ['11:05', '11:10', '11:15', '11:18', '11:20', '11:22', '11:25', '11:30'],
            datasets: [
              {
                label: 'Ready Pods (/ 3)',
                data: [0, 0, 0, 1, 2, 3, 3, 3],
                borderColor: '#22c55e',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                fill: true,
                tension: 0.3
              },
              {
                label: 'Error Rate (%)',
                data: [100, 100, 100, 45, 12, 0, 0, 0],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.05)',
                fill: true,
                tension: 0.3
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '11:17:00', level: 'INFO', source: 'kubectl', message: 'configmap/auth-service-config patched (YAML indentation fixed)' },
        { timestamp: '11:17:05', level: 'INFO', source: 'kubectl', message: 'deployment.apps/auth-service restarted' },
        { timestamp: '11:17:30', level: 'INFO', source: 'auth-service', message: 'Starting auth-service v3.5.2...' },
        { timestamp: '11:17:31', level: 'INFO', source: 'auth-service', message: 'Configuration loaded successfully from /etc/config/application.yaml' },
        { timestamp: '11:17:32', level: 'INFO', source: 'auth-service', message: 'Connected to Redis cluster: redis-new-cluster.platform.svc.cluster.local:6379' },
        { timestamp: '11:17:35', level: 'INFO', source: 'auth-service', message: 'Server listening on port 8080 - ready to accept connections' },
        { timestamp: '11:18:00', level: 'INFO', source: 'kubelet', message: 'Pod auth-service-6a9e8d5c7-xyz01: Ready (liveness/readiness probes passed)' },
        { timestamp: '11:22:00', level: 'INFO', source: 'monitoring', message: 'All 3 pods ready, error rate 0%, service fully recovered' }
      ],
      choices: [
        {
          text: '근본 원인 분석 완료 - Post-mortem 작성으로 진행',
          nextStep: 'step-final',
          isOptimal: true,
          feedback: '서비스가 정상 복구되었습니다. 이제 재발 방지를 위한 Post-mortem을 작성합니다.'
        }
      ],
      hint: '서비스가 복구되었는지 확인하려면 모든 Pod가 Ready 상태인지, Error Rate가 0%로 돌아왔는지 모니터링하세요.'
    },

    'step-final': {
      id: 'step-final',
      title: '조사 완료',
      isTerminal: true,
      rootCause: {
        title: 'ConfigMap YAML 인덴테이션 오류로 인한 애플리케이션 시작 실패',
        summary: 'auth-service의 ConfigMap(auth-service-config)에서 Redis 연결 설정을 업데이트하는 과정에서 YAML 인덴테이션 오류가 발생했습니다. "host" 필드가 "cluster"의 하위 항목으로 잘못 들여쓰기되어 YAML 파서가 설정 파일을 읽을 수 없었습니다. 이로 인해 모든 Pod가 시작 직후 크래시하면서 CrashLoopBackOff 상태에 빠졌고, 인증 서비스가 완전히 중단되었습니다.',
        timeline: [
          { time: '11:04:30', event: 'DevOps 팀이 ConfigMap "auth-service-config" 업데이트 (Redis 연결 설정 변경)' },
          { time: '11:04:35', event: 'ConfigMap 변경이 Pod에 반영됨 (volume mount auto-refresh)' },
          { time: '11:04:40', event: 'auth-service Pod가 설정 재로드 시 YAML 파싱 에러로 크래시' },
          { time: '11:05:00', event: '3개 Pod 모두 CrashLoopBackOff 진입, 서비스 완전 중단' },
          { time: '11:05:12', event: 'Datadog 알림: available replicas = 0, error rate = 100%' },
          { time: '11:15:00', event: '장애 조사 시작' },
          { time: '11:17:00', event: 'ConfigMap YAML 인덴테이션 오류 수정 및 Pod 재시작' },
          { time: '11:22:00', event: '모든 Pod Ready, 서비스 정상 복구 (MTTR: 약 17분)' }
        ],
        resolution: [
          'ConfigMap YAML 인덴테이션 오류 수정: host 필드를 cluster와 같은 레벨로 이동',
          'ConfigMap 변경 시 YAML 유효성 검증(lint) 파이프라인 추가 (yamllint, kubeval)',
          'GitOps 도입: ConfigMap 변경도 Git PR + 코드 리뷰를 통해 관리',
          'Admission Webhook으로 잘못된 ConfigMap 배포 차단 (Open Policy Agent/Gatekeeper)',
          'ConfigMap을 immutable로 설정하고, 변경 시 새로운 ConfigMap 생성 + Deployment 업데이트 패턴 적용',
          'Canary 배포 전략: ConfigMap 변경 시 한 Pod에만 먼저 적용하여 검증 후 전체 반영'
        ]
      },
      postMortem: {
        template: {
          fields: [
            { id: 'impact', label: '영향 범위 (Impact)', placeholder: '어떤 서비스와 사용자에게 영향이 있었는지 기술하세요. 예: 인증 서비스 완전 중단으로 전체 API 호출 실패' },
            { id: 'detection', label: '탐지 방법 (Detection)', placeholder: '장애를 어떻게 발견했는지 기술하세요. 예: Datadog Pod Ready 알림, Error Rate 100% 알림' },
            { id: 'root-cause', label: '근본 원인 (Root Cause)', placeholder: '기술적 근본 원인을 상세히 기술하세요.' },
            { id: 'mitigation', label: '긴급 대응 (Mitigation)', placeholder: '장애를 멈추기 위해 어떤 조치를 취했는지 기술하세요.' },
            { id: 'prevention', label: '재발 방지 (Prevention)', placeholder: '같은 종류의 장애가 다시 발생하지 않도록 어떤 조치를 할 것인지 기술하세요.' },
            { id: 'lessons', label: '교훈 (Lessons Learned)', placeholder: '이번 장애에서 배운 점을 기술하세요.' }
          ]
        }
      }
    }
  },

  optimalPath: ['step-1', 'step-2a', 'step-3a', 'step-4a', 'step-5a', 'step-final'],

  scoring: {
    maxSteps: 6,
    gradeThresholds: {
      S: { maxExtraSteps: 0, maxHints: 0, label: 'Expert Debugger' },
      A: { maxExtraSteps: 2, maxHints: 1, label: 'Proficient' },
      B: { maxExtraSteps: 4, maxHints: 2, label: 'Developing' },
      C: { maxExtraSteps: 999, maxHints: 999, label: 'Learning' }
    }
  }
};
