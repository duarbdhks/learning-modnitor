# Service Incident Analysis

장애 원인을 데이터로 추적하는 백엔드 개발자 되기 - 서비스 장애 분석 학습 플랫폼

> https://duarbdhks.github.io/learning-modnitor/

## Modules (0-25)

| # | Track | Module | Description | Status |
|---|-------|--------|-------------|--------|
| 0 | Theory | 지표의 기초 | RED/USE 방법론, Leading/Lagging 지표 | Current |
| 1 | Theory | 서비스 신뢰성 지표 | SLI/SLO/SLA, Error Budget | Current |
| 2 | Theory | Datadog RUM | 프론트엔드 사용자 경험 모니터링 | Current |
| 3 | Theory | AWS RDS 메트릭 | 데이터베이스 성능 지표 분석 | Current |
| 4 | Theory | Kubernetes 모니터링 | 컨테이너 리소스 모니터링 | Current |
| 5 | Theory | 장애 원인 분석 | 통합 분석 프레임워크 | Current |
| 6 | Theory | 대시보드 설계 | 모니터링 대시보드 설계 원칙 | Current |
| 7 | Lab | DB Connection Pool 고갈 | 배치 쿼리 커넥션 점유로 인한 API 장애 추적 | Current |
| 8 | Lab | Slow Query CPU 포화 | 인덱스 누락/풀스캔 기반 성능 저하 분석 | Current |
| 9 | Lab | Memory Leak OOMKill | 힙 누수와 Pod 재시작 반복 장애 대응 | Current |
| 10 | Lab | CrashLoopBackOff | 설정 오류로 인한 재시작 루프 분석 | Current |
| 11 | Lab | GraphQL API 성능 회귀 | 배포 후 응답 지연 및 N+1 이슈 추적 | Current |
| 12 | Lab | Cascading Failure | 외부 API 장애 전파와 회로차단 실패 분석 | Current |
| 13 | Lab | Deployment Rollback 판단 | 카나리 신호 기반 롤백 의사결정 | Current |
| 14 | Lab | RDS Deadlock Storm | 트랜잭션 경합/교착상태 폭증 분석 | Current |
| 15 | Lab | Event Loop Saturation | Node.js 이벤트 루프 블로킹 진단 | Current |
| 16 | Lab | Disk I/O & Inode Exhaustion | 디스크 병목과 inode 고갈 복합 장애 대응 | Current |
| 17 | Lab | Redis Cache Stampede | 캐시 스탬피드와 DB 부하 전이 분석 | Current |
| 18 | Lab | CPU Throttling + Network Saturation | 리소스 제한과 네트워크 포화 복합 장애 분석 | Current |
| 19 | Theory | Datadog Monitor Engineering | 정탐률 중심 모니터 튜닝과 알림 품질 개선 | Current |
| 20 | Theory | Datadog SLO Operations | Error Budget 운영과 Burn Rate 기반 대응 | Current |
| 21 | Theory | Datadog Cost Governance | 태그 정책, 사용량 가드레일, 비용 최적화 운영 | Current |
| 22 | Lab | Monitor Tuning 실습 | 임계치/필터 튜닝으로 알림 정탐률 개선 | Current |
| 23 | Lab | Burn-rate Routing 실습 | Burn Rate 급등 시 라우팅/우선순위 대응 훈련 | Current |
| 24 | Lab | Sampling & Cardinality 실습 | 샘플링/태그 cardinality 최적화 훈련 | Current |
| 25 | Lab | Incident Workflow 실습 | 탐지-에스컬레이션-복구-회고 대응 흐름 훈련 | Current |

## Tech Stack

- Vanilla HTML/CSS/JavaScript (빌드 도구 없음)
- Tailwind CSS (CDN)
- Prism.js (코드 하이라이팅)
- localStorage (진도 관리)

## Local Development

```bash
open index.html
```
