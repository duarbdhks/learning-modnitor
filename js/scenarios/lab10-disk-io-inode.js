var SCENARIO_LAB10 = {
  id: 'lab10-disk-io-inode',
  title: 'Disk I/O & Inode Exhaustion',
  difficulty: 'advanced',

  alert: {
    severity: 'critical',
    source: 'Datadog Monitor',
    timestamp: '2024-04-22 10:42:35 KST',
    title: '[P1] EKS Node Disk I/O 지연 및 파일 생성 실패',
    message: 'data-pipeline-node-3에서 disk 사용률 90% 초과 및 I/O await 시간이 500ms를 넘어섰습니다. "No space left on device" 에러가 발생하고 있습니다.',
    metric: { name: 'system.disk.in_use', value: '94', unit: '%', threshold: '90' },
    tags: ['node:data-pipeline-node-3', 'env:production', 'severity:p1']
  },

  briefing: {
    description: '월요일 오전 10시 42분, 데이터 파이프라인 서비스에서 파일 쓰기 실패 알림이 연이어 발생하고 있습니다. 주말 동안 토요일 새벽에 EKS 노드의 OS 업그레이드가 진행되었으며, 이후 temp 파일 정리 작업이 중단된 것으로 보입니다. 디스크 공간은 여유가 있어 보이지만 파일 생성이 실패하고 있습니다.',
    environment: {
      services: ['data-pipeline (Python)', 'EKS Node (Ubuntu 22.04)'],
      infra: 'EKS, ephemeral storage, ext4 filesystem',
      monitoring: 'Datadog Infrastructure Agent'
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
      title: 'Disk Alert 확인',
      description: 'Datadog Infrastructure 대시보드를 열어 data-pipeline-node-3의 디스크 상태를 확인합니다. disk 사용률이 높고 I/O await 시간이 급격히 증가하고 있습니다.',
      metrics: [
        {
          title: 'Disk 사용률 추이 (72h)',
          chartType: 'line',
          chartConfig: {
            labels: ['Sat 02:00', 'Sat 12:00', 'Sun 00:00', 'Sun 12:00', 'Mon 00:00', 'Mon 06:00', 'Mon 09:00', 'Mon 10:42'],
            datasets: [{
              label: 'system.disk.in_use (%)',
              data: [42, 48, 55, 63, 72, 80, 88, 94],
              borderColor: '#f59e0b',
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              tension: 0.3,
              fill: true
            }]
          }
        },
        {
          title: 'I/O Await 시간 추이',
          chartType: 'line',
          chartConfig: {
            labels: ['Mon 09:00', '09:30', '10:00', '10:15', '10:30', '10:38', '10:42'],
            datasets: [{
              label: 'system.io.await (ms)',
              data: [8, 12, 25, 85, 220, 450, 680],
              borderColor: '#ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              tension: 0.3,
              fill: true
            }]
          }
        }
      ],
      logs: [
        { timestamp: '10:42:12', level: 'ERROR', service: 'data-pipeline', message: '[FileWriter] OSError: [Errno 28] No space left on device: \'/tmp/pipeline/batch_20240422_104212.tmp\'' },
        { timestamp: '10:42:18', level: 'ERROR', service: 'data-pipeline', message: '[BatchProcessor] Failed to create temp file: Cannot allocate inode' },
        { timestamp: '10:42:25', level: 'WARN', service: 'kubelet', message: '[disk-monitor] node data-pipeline-node-3: disk pressure detected, eviction threshold approaching' },
        { timestamp: '10:42:35', level: 'ERROR', service: 'data-pipeline', message: '[PipelineExecutor] Batch processing halted: Unable to write intermediate files' }
      ],
      choices: [
        {
          text: 'df -h와 df -i로 디스크 공간 및 inode 사용량 확인',
          isOptimal: true,
          feedback: '정확한 판단입니다. "No space left on device" 에러는 디스크 공간뿐만 아니라 inode 고갈에서도 발생할 수 있습니다. 두 가지를 모두 확인해야 합니다.',
          nextStep: 'step-2a'
        },
        {
          text: 'EBS 볼륨 IOPS 및 throughput 확인',
          isOptimal: false,
          feedback: 'EBS 볼륨을 확인하는 것도 중요하지만, 이 노드는 ephemeral storage를 사용합니다. 먼저 로컬 디스크 상태를 확인해보세요.',
          nextStep: 'step-2b'
        },
        {
          text: 'data-pipeline Pod 재시작으로 즉시 복구',
          isOptimal: false,
          feedback: 'Pod를 재시작해도 노드의 디스크 문제는 해결되지 않습니다. 파일 시스템 자체의 문제를 먼저 파악해야 합니다.',
          nextStep: 'step-2c-deadend'
        }
      ],
      hint: '"No space left on device" 에러가 발생했지만 df -h로 보면 디스크 공간은 여유가 있을 수 있습니다. df -i로 inode 사용량도 함께 확인하세요.'
    },

    'step-2a': {
      title: 'Inode 고갈 확인',
      description: 'df -h 출력을 보니 디스크 공간은 40GB 중 37GB 사용(94%)으로 여유가 거의 없지만, df -i 출력을 보니 inode가 99.8% 사용되어 사실상 고갈 상태입니다. ext4 파일시스템은 약 260만 개의 inode를 가지고 있으며, 현재 259만 개가 사용 중입니다. 수많은 소형 파일들이 inode를 모두 소진한 것으로 보입니다.',
      metrics: [
        {
          title: 'Inode vs Disk 사용률 비교 (72h)',
          chartType: 'line',
          chartConfig: {
            labels: ['Sat 02:00', 'Sat 12:00', 'Sun 00:00', 'Sun 12:00', 'Mon 00:00', 'Mon 06:00', 'Mon 09:00', 'Mon 10:42'],
            datasets: [
              {
                label: 'system.fs.inodes.in_use (%)',
                data: [35, 42, 52, 64, 78, 89, 96, 99.8],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.3,
                fill: true
              },
              {
                label: 'system.disk.in_use (%)',
                data: [42, 48, 55, 63, 72, 80, 88, 94],
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                tension: 0.3,
                fill: true
              }
            ]
          }
        },
        {
          title: 'File Handles Allocated',
          chartType: 'line',
          chartConfig: {
            labels: ['Sat 02:00', 'Sat 12:00', 'Sun 00:00', 'Sun 12:00', 'Mon 00:00', 'Mon 06:00', 'Mon 10:00'],
            datasets: [{
              label: 'system.fs.file_handles.allocated',
              data: [1200, 1800, 4500, 12000, 28000, 45000, 62000],
              borderColor: '#8b5cf6',
              backgroundColor: 'rgba(139, 92, 246, 0.1)',
              tension: 0.3,
              fill: true
            }]
          }
        }
      ],
      logs: [
        { timestamp: '10:43:00', level: 'INFO', service: 'ssh-session', message: '[root@data-pipeline-node-3] $ df -h /\nFilesystem      Size  Used Avail Use% Mounted on\n/dev/nvme0n1p1   40G   37G  3.0G  94% /' },
        { timestamp: '10:43:05', level: 'INFO', service: 'ssh-session', message: '[root@data-pipeline-node-3] $ df -i /\nFilesystem      Inodes  IUsed   IFree IUse% Mounted on\n/dev/nvme0n1p1  2.6M    2.59M   4.8K  99.8% /' },
        { timestamp: '10:43:10', level: 'WARN', service: 'filesystem', message: '[ext4] Inode exhaustion detected: 2,594,816 / 2,600,000 inodes used' },
        { timestamp: '10:43:15', level: 'INFO', service: 'ssh-session', message: '[root@data-pipeline-node-3] $ ls /tmp/pipeline | wc -l\n3612480' }
      ],
      choices: [
        {
          text: 'temp 파일 증가 원인 추적 (find + 정리 작업 상태 확인)',
          isOptimal: true,
          feedback: '탁월한 판단입니다. 360만 개가 넘는 소형 temp 파일이 inode를 고갈시켰습니다. 이 파일들이 왜 정리되지 않았는지 추적해야 합니다.',
          nextStep: 'step-3a'
        },
        {
          text: '즉시 rm -rf /tmp/pipeline으로 전체 삭제',
          isOptimal: false,
          feedback: '긴급 상황에서 즉시 삭제하는 것도 방법이지만, 원인을 먼저 파악하지 않으면 재발할 수 있습니다. 정리 작업이 왜 중단되었는지 확인 후 삭제하는 것이 더 안전합니다.',
          nextStep: 'step-3a'
        }
      ],
      hint: 'Inode는 파일시스템에서 각 파일/디렉토리를 추적하는 메타데이터 구조입니다. 파일 크기가 작아도 각 파일마다 하나의 inode가 필요하므로, 수백만 개의 소형 파일이 누적되면 디스크 공간은 남아도 inode가 고갈될 수 있습니다.'
    },

    'step-2b': {
      title: 'EBS 볼륨 확인',
      description: '이 노드는 EBS 볼륨이 아닌 ephemeral storage를 사용하고 있습니다. IOPS와 throughput 메트릭을 확인해보니 큰 문제는 없으나, I/O await 시간만 비정상적으로 높습니다. 로컬 디스크의 inode 고갈 문제를 확인해야 합니다.',
      metrics: [
        {
          title: 'I/O Operations (Read/Write)',
          chartType: 'line',
          chartConfig: {
            labels: ['Mon 09:00', '09:30', '10:00', '10:15', '10:30', '10:38', '10:42'],
            datasets: [
              {
                label: 'system.io.r_s (read/s)',
                data: [120, 125, 130, 128, 135, 140, 145],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                tension: 0.3,
                fill: true
              },
              {
                label: 'system.io.w_s (write/s)',
                data: [85, 90, 95, 92, 98, 102, 105],
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
        { timestamp: '10:43:30', level: 'INFO', service: 'datadog-agent', message: '[disk-monitor] data-pipeline-node-3: ephemeral storage, no EBS volume attached' },
        { timestamp: '10:43:35', level: 'INFO', service: 'datadog-agent', message: '[io-stats] Read/write ops normal, but await time abnormally high — likely filesystem issue' }
      ],
      choices: [
        {
          text: 'df -i로 inode 사용량 확인으로 돌아가기',
          isOptimal: true,
          feedback: '올바른 판단입니다. I/O 처리량은 정상이지만 await 시간이 높다면 파일시스템 레벨의 문제입니다. Inode 고갈을 확인해야 합니다.',
          nextStep: 'step-2a'
        }
      ],
      hint: 'I/O await 시간이 높지만 read/write 처리량이 정상이라면, 디스크 하드웨어보다는 파일시스템 메타데이터(inode) 고갈이 원인일 가능성이 높습니다.'
    },

    'step-2c-deadend': {
      title: 'Pod 재시작 — Dead End',
      description: 'data-pipeline Pod를 재시작했지만, 새로운 배치 작업이 시작되자 곧바로 동일한 "No space left on device" 에러가 재발했습니다. Pod 재시작은 애플리케이션 프로세스를 재시작할 뿐, 노드의 파일시스템 inode 고갈 문제를 해결하지 못합니다.',
      isDeadEnd: true,
      metrics: [
        {
          title: 'Pod 재시작 후 에러 재발',
          chartType: 'line',
          chartConfig: {
            labels: ['10:45', '10:46', '10:47', '10:48', '10:49', '10:50'],
            datasets: [{
              label: 'Error Rate (errors/min)',
              data: [0, 5, 18, 32, 38, 42],
              borderColor: '#ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              tension: 0.3,
              fill: true
            }]
          }
        }
      ],
      logs: [
        { timestamp: '10:45:10', level: 'INFO', service: 'k8s-controller', message: '[pod-lifecycle] data-pipeline-7d8f9c-abc12 terminated, new pod data-pipeline-7d8f9c-xyz89 started' },
        { timestamp: '10:46:30', level: 'ERROR', service: 'data-pipeline', message: '[FileWriter] OSError: [Errno 28] No space left on device (same error after restart)' },
        { timestamp: '10:47:05', level: 'ERROR', service: 'data-pipeline', message: '[BatchProcessor] Cannot create /tmp/pipeline/batch_20240422_104705.tmp' }
      ],
      learningMoment: {
        title: '디스크/Inode 고갈은 Pod 재시작으로 해결 불가',
        explanation: 'Pod 재시작은 애플리케이션 프로세스를 재시작할 뿐, 노드의 파일시스템 상태(디스크 공간, inode)에는 영향을 주지 않습니다. "No space left on device" 에러는 파일시스템 레벨의 문제이므로, Pod를 재시작해도 동일한 노드에서 실행되면 같은 문제가 반복됩니다. df -h와 df -i로 디스크 및 inode 상태를 확인하고, 불필요한 파일을 정리하거나 노드를 교체해야 합니다.',
        moduleReference: '모듈 10: Disk I/O & Inode Exhaustion'
      },
      redirectTo: 'step-1',
      redirectMessage: '처음으로 돌아가서 디스크와 inode 상태를 확인해보세요.'
    },

    'step-3a': {
      title: 'Temp 파일 원인 분석',
      description: 'find 명령어로 /tmp/pipeline 디렉토리를 조사한 결과, 토요일 새벽부터 360만 개 이상의 소형 temp 파일(.tmp)이 누적되어 있습니다. 평소에는 매일 정각에 실행되는 cleanup cron job이 이 파일들을 삭제했는데, 토요일 새벽 OS 업그레이드 후 systemd timer가 비활성화되면서 정리 작업이 중단되었습니다. 주말 동안 누적된 파일들이 inode를 고갈시켰습니다.',
      metrics: [
        {
          title: 'Temp 파일 개수 증가 추이',
          chartType: 'bar',
          chartConfig: {
            labels: ['Sat 06:00', 'Sat 18:00', 'Sun 06:00', 'Sun 18:00', 'Mon 06:00', 'Mon 10:00'],
            datasets: [{
              label: '누적 temp 파일 개수',
              data: [120000, 520000, 980000, 1800000, 2900000, 3612000],
              backgroundColor: '#f59e0b'
            }]
          }
        },
        {
          title: 'Cleanup Job 실행 횟수 (Expected vs Actual)',
          chartType: 'bar',
          chartConfig: {
            labels: ['Fri (before)', 'Sat (upgrade)', 'Sun', 'Mon (until 10:00)'],
            datasets: [
              {
                label: 'Expected',
                data: [24, 24, 24, 10],
                backgroundColor: '#10b981'
              },
              {
                label: 'Actual',
                data: [24, 24, 0, 0],
                backgroundColor: '#ef4444'
              }
            ]
          }
        }
      ],
      logs: [
        { timestamp: '10:44:00', level: 'INFO', service: 'ssh-session', message: '[root@data-pipeline-node-3] $ find /tmp/pipeline -type f -name "*.tmp" | wc -l\n3612480' },
        { timestamp: '10:44:10', level: 'INFO', service: 'ssh-session', message: '[root@data-pipeline-node-3] $ systemctl status pipeline-cleanup.timer\n● pipeline-cleanup.timer - Pipeline Temp Cleanup Timer\n   Loaded: loaded (/etc/systemd/system/pipeline-cleanup.timer; disabled; vendor preset: enabled)\n   Active: inactive (dead) since Sat 2024-04-20 02:15:33 KST' },
        { timestamp: '10:44:15', level: 'WARN', service: 'systemd', message: '[timer] pipeline-cleanup.timer was disabled during OS upgrade and not re-enabled' },
        { timestamp: '10:44:20', level: 'INFO', service: 'ssh-session', message: '[root@data-pipeline-node-3] $ journalctl -u pipeline-cleanup.service --since "Sat 2024-04-20 00:00:00"\n-- No entries found (service not executed since upgrade)' }
      ],
      choices: [
        {
          text: 'cleanup timer 재활성화 + 수동 정리 실행',
          isOptimal: true,
          feedback: '최고의 선택입니다. systemd timer를 다시 활성화하고, 즉시 cleanup 스크립트를 실행하여 누적된 파일을 정리하면 inode가 복구됩니다.',
          nextStep: 'step-4a'
        },
        {
          text: '노드 교체 (cordon + drain + 새 노드 프로비저닝)',
          isOptimal: false,
          feedback: '노드를 교체하면 문제는 해결되지만, cleanup timer를 재활성화하지 않으면 새 노드에서도 같은 문제가 재발할 수 있습니다. 먼저 근본 원인을 해결하는 것이 좋습니다.',
          nextStep: 'step-4a'
        }
      ],
      hint: 'OS 업그레이드 시 systemd timer나 cron job이 비활성화되는 경우가 종종 있습니다. 업그레이드 후 반드시 중요한 스케줄 작업들이 정상 동작하는지 확인해야 합니다.'
    },

    'step-4a': {
      title: 'Cleanup 복구 및 Inode 회복',
      description: 'systemctl enable --now pipeline-cleanup.timer로 timer를 재활성화하고, 수동으로 cleanup 스크립트를 실행하여 누적된 360만 개의 temp 파일을 삭제했습니다. Inode 사용률이 99.8%에서 35%로 급격히 감소하고, I/O await 시간도 정상 수준으로 복구되었습니다. data-pipeline 서비스가 정상적으로 파일을 생성하며 배치 처리를 재개했습니다.',
      metrics: [
        {
          title: 'Inode 사용률 복구',
          chartType: 'line',
          chartConfig: {
            labels: ['10:45 (before)', '10:47', '10:50', '10:55', '11:00', '11:05', '11:10'],
            datasets: [{
              label: 'system.fs.inodes.in_use (%)',
              data: [99.8, 92, 78, 58, 42, 36, 35],
              borderColor: '#10b981',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              tension: 0.3,
              fill: true
            }]
          }
        },
        {
          title: 'I/O Await 복구',
          chartType: 'line',
          chartConfig: {
            labels: ['10:45 (before)', '10:47', '10:50', '10:55', '11:00', '11:05', '11:10'],
            datasets: [{
              label: 'system.io.await (ms)',
              data: [680, 450, 180, 45, 12, 8, 6],
              borderColor: '#10b981',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              tension: 0.3,
              fill: true
            }]
          }
        }
      ],
      logs: [
        { timestamp: '10:45:30', level: 'INFO', service: 'ssh-session', message: '[root@data-pipeline-node-3] $ systemctl enable --now pipeline-cleanup.timer\nCreated symlink /etc/systemd/system/timers.target.wants/pipeline-cleanup.timer' },
        { timestamp: '10:46:00', level: 'INFO', service: 'ssh-session', message: '[root@data-pipeline-node-3] $ /usr/local/bin/pipeline-cleanup.sh\nStarting cleanup: 3612480 files to delete...' },
        { timestamp: '10:52:15', level: 'INFO', service: 'cleanup-script', message: '[pipeline-cleanup] Deleted 3,612,480 temp files (total: 18.4 GB freed, 3,612,480 inodes released)' },
        { timestamp: '10:52:30', level: 'INFO', service: 'ssh-session', message: '[root@data-pipeline-node-3] $ df -i /\nFilesystem      Inodes  IUsed   IFree IUse% Mounted on\n/dev/nvme0n1p1  2.6M    912K    1.7M  35% /' },
        { timestamp: '10:53:00', level: 'INFO', service: 'data-pipeline', message: '[BatchProcessor] Batch processing resumed: temp files created successfully' },
        { timestamp: '10:55:00', level: 'INFO', service: 'datadog-monitor', message: '[disk-monitor] data-pipeline-node-3: inode usage 35%, I/O await 6ms (fully recovered)' }
      ],
      choices: [
        {
          text: '재발 방지 대책 수립 및 사후 분석',
          isOptimal: true,
          feedback: '완벽합니다. 장애를 복구했으니 이제 OS 업그레이드 체크리스트를 강화하고 모니터링을 개선하여 재발을 방지해야 합니다.',
          nextStep: 'step-final'
        }
      ],
      hint: 'Inode 고갈은 작은 파일이 대량으로 누적될 때 발생합니다. 정기적인 cleanup 작업과 inode 사용률 모니터링이 필수입니다.'
    },

    'step-final': {
      title: '사후 분석 및 재발 방지',
      description: '장애가 완전히 복구되었습니다. 근본 원인은 토요일 새벽 OS 업그레이드 중 systemd timer가 비활성화되면서 temp 파일 정리 작업이 중단되었고, 주말 동안 360만 개의 소형 파일이 누적되어 inode를 고갈시킨 것입니다. 재발 방지를 위해 OS 업그레이드 체크리스트를 강화하고, inode 사용률 모니터링을 추가하며, cleanup 작업의 이중화를 구성했습니다.',
      isTerminal: true,
      rootCause: {
        title: 'Disk I/O & Inode Exhaustion',
        summary: '토요일 새벽 OS 업그레이드 중 pipeline-cleanup.timer(systemd)가 비활성화되면서 temp 파일 정리 중단 → 주말간 360만 개 소형 파일 누적 → 월요일 오전 inode 99.8% 고갈 → 파일 생성 실패 및 I/O await 급등',
        timeline: [
          { time: 'Sat 02:00', event: 'OS 업그레이드 시작 (Ubuntu 22.04 패치)' },
          { time: 'Sat 02:15', event: 'OS 업그레이드 완료 — pipeline-cleanup.timer 비활성화됨 (upgrade 부작용)' },
          { time: 'Sat 06:00~Sun 18:00', event: '주말간 temp 파일 누적 (정리 작업 중단으로 180만 개 → 360만 개)' },
          { time: 'Mon 06:00', event: 'Inode 사용률 89% 도달 (주말 배치 작업 증가)' },
          { time: 'Mon 10:00', event: 'Inode 사용률 96% 도달, I/O await 시간 급등 시작' },
          { time: 'Mon 10:42', event: 'Inode 99.8% 고갈, "No space left on device" 에러 폭발, Datadog P1 알림 발생' },
          { time: 'Mon 10:45', event: 'df -i로 inode 고갈 확인, systemd timer 중단 원인 발견' },
          { time: 'Mon 10:46~10:52', event: 'Cleanup 스크립트 수동 실행 (360만 파일 삭제, 6분 소요)' },
          { time: 'Mon 10:55', event: 'Inode 사용률 35% 복구, I/O await 정상화, 배치 처리 재개' }
        ],
        resolution: [
          '즉시 조치: systemctl enable --now pipeline-cleanup.timer 재활성화 + 수동 cleanup 실행',
          'OS 업그레이드 체크리스트: systemd timer/cron job 활성화 상태 확인 항목 추가',
          'Inode 모니터링: system.fs.inodes.in_use 메트릭을 Datadog에 추가, 90% 임계값 알림 설정',
          'Cleanup 이중화: Kubernetes CronJob으로 동일한 cleanup 작업 병행 실행 (systemd 장애 대비)',
          'Temp 파일 수명 제한: data-pipeline 코드에 24시간 이상 된 temp 파일 자동 삭제 로직 추가',
          '업그레이드 검증: OS 업그레이드 후 30분간 critical timer/cron 정상 실행 확인 후 완료 처리'
        ]
      },
      postMortem: {
        template: {
          fields: [
            {
              label: 'Inode란 무엇이며, 디스크 공간과 어떻게 다른가요?',
              type: 'textarea',
              placeholder: 'Inode는 파일시스템에서 각 파일/디렉토리의 메타데이터를 저장하는 구조입니다. 디스크 공간은 파일의 내용을 저장하는 공간이고, inode는 파일의 존재 자체를 추적하는 공간입니다. 파일 크기가 작아도 각 파일마다 inode가 필요하므로, 수백만 개의 소형 파일이 있으면 디스크 공간은 남아도 inode가 고갈될 수 있습니다.',
              hint: 'Disk space = 파일 내용, Inode = 파일 메타데이터'
            },
            {
              label: 'Inode 사용량을 확인하는 명령어는?',
              type: 'text',
              placeholder: 'df -i',
              hint: 'df 명령어의 inode 옵션'
            },
            {
              label: 'OS 업그레이드 후 반드시 확인해야 할 체크리스트 3가지를 작성하세요.',
              type: 'textarea',
              placeholder: '1. systemd timer/cron job 활성화 상태 확인\n2. 중요 서비스 프로세스 정상 실행 확인\n3. 디스크/네트워크/메모리 등 리소스 메트릭 정상 여부 30분간 모니터링',
              hint: '타이머, 서비스, 리소스 관점에서 생각해보세요'
            },
            {
              label: '이번 장애에서 배운 핵심 교훈 3가지를 작성하세요.',
              type: 'textarea',
              placeholder: '1. Inode 고갈은 디스크 공간과 별개로 모니터링 필요\n2. OS 업그레이드는 systemd/cron 작업을 비활성화할 수 있음\n3. 주말/휴일 전 critical job 정상 동작 여부 확인 필수',
              hint: '모니터링, 업그레이드, 타이밍 관점에서 생각해보세요'
            }
          ]
        }
      }
    }
  }
};
