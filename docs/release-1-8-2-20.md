---
type: Release
title: Acedia 1.8.2.20
status: candidate
last_updated: 2026-11-16
---

# Acedia 1.8.2.20

- Remote의 공개 주소 한 칸에 `agent.example.com/acedia` 또는 `https://agent.example.com/dddd/`처럼 하위 경로를 포함할 수 있다. 입력한 경로 아래에서 로그인·API·터미널 SSE·다운로드·문서 및 Hosting 미리보기를 제공한다.
- 공개 주소에 맞는 OAuth callback URL을 설정 화면에 표시하며, 쿠키·PWA 설치·서비스워커·오프라인 캐시·알림 이동도 해당 경로를 사용한다. 같은 도메인의 다른 서비스 캐시와 경로를 보존한다.
- Cloudflare에서 지정 경로를 해당 로컬 포트로 전달하고 GitHub OAuth callback URL도 맞춰야 한다. Acedia의 주소 저장만으로 Cloudflare나 OAuth App 설정을 변경하지 않는다.
- Standard EXE 채널 배포다. 기존 서명 APK 1.8.1.39를 재사용하며 이번 하위 경로 지원은 업데이트된 데스크톱의 브라우저/PWA로 사용할 수 있다. Android 소스의 경로 보존 변경은 새 APK 빌드 전까지 기존 APK에 반영되지 않는다.

## English

- Accept a complete public Remote address with a service path in one field, such as `agent.example.com/acedia` or `https://agent.example.com/dddd/`. Serve login, APIs, terminal SSE, downloads and document/Hosting previews beneath that path.
- Display the derived OAuth callback URL. Scope cookies, PWA installation, the service worker, offline caches and notification navigation to the configured path while preserving sibling services.
- Configure Cloudflare to forward the original path to the local Remote port and set the corresponding GitHub OAuth callback separately. Saving the address does not change either external service.
- Standard EXE release reusing the signed Android APK 1.8.1.39. The updated desktop supports service paths in browsers/PWAs; Android source changes require a separate APK build before existing native clients gain them.

## 검증

- 앱 전체 264개 파일·2,124개 테스트, TypeScript/Vite 프로덕션 빌드, 모바일 26개 테스트·타입 검사가 통과했다. 버전 고정 후 배포 검증 결과를 추가한다.
- 격리된 HTTP에서 `/acedia/`, `/dddd/`, 중첩 경로와 `/api/` 이름의 경로를 검사한다. OAuth 콜백·쿠키·로그아웃·Origin 검사·API·SSE·HTML/CSS 미리보기·manifest·터널 링크를 포함한다.
- GUI 자동화·운영 세션 변경·실제 설치와 도메인·Cloudflare·OAuth App 설정 변경은 수행하지 않는다. 공개 배포 검증과 사용자의 설치 확인은 구분한다.
