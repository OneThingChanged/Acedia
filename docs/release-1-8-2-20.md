---
type: Release
title: Acedia 1.8.2.20
status: published
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

- 버전 갱신 후 앱 전체 264개 파일·2,124개 테스트, TypeScript/Vite 프로덕션 빌드, 모바일 26개 테스트·타입 검사가 통과했다.
- 격리된 HTTP에서 `/acedia/`, `/dddd/`, 중첩 경로와 `/api/` 이름의 경로를 검사했다. OAuth 콜백·쿠키·로그아웃·Origin 검사·API·SSE·HTML/CSS 미리보기·manifest·터널 링크를 포함한다.
- GUI 자동화·운영 세션 변경·실제 설치와 도메인·Cloudflare·OAuth App 설정 변경은 수행하지 않았다. 공개 배포 검증과 사용자의 설치 확인은 구분한다.

## 패키지 검증

- 제품 소스 `09fb34b35d4759b4aa4af4312a61de275e1c52a6`를 별도 작업 폴더에 고정하고 독립 복사한 의존성으로 빌드했다. ASAR 런타임·렌더러 432개 파일, Pixel Office 자산·라이선스 20개와 정본 라이선스·제3자 고지를 원본과 대조했다.
- 패키지의 Electron Node 런타임·인증된 HTTP·native PTY 검사 29개가 통과했다. `/acedia/`, `/dddd/`, `/tools/remote/`의 로그인·API·자산·PWA·OAuth 콜백·쿠키·로그아웃과 다른 경로의 API 거부를 실제 패키지에서 확인했다. 기존 세션·전달·보드·라우팅·내장 스킬 검사도 포함한다.
- 로컬·공개 EXE의 NSIS CRC `afa6644b`, 내부 압축 데이터 전체와 설치 전 검증 모드가 통과했다. Authenticode 상태는 `NotSigned`다. 설치 검증 모드는 설치·레지스트리 변경·기존 앱 종료 전에 종료한다.
- 빌드 PC에서 PowerShell 7 모듈 경로가 Windows PowerShell 자식 프로세스에 상속되어 압축 해제가 실패했다. 빌드 프로세스의 `PSModulePath`를 Windows PowerShell 기본 모듈 경로로 지정해 Archive 1.0.1.0을 사용한 뒤 같은 제품 소스·버전으로 재빌드했다. 전역 모듈이나 제품 소스는 변경하지 않았다.

## 공개 배포 기록

- 공개 릴리스: [v1.8.2.20](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.2.20).
- 게시: **2026-11-16 01:42:51 KST**. 공개 전체 다운로드 검증: **2026-11-16 01:43:39 KST**.
- **`1.8.2.19` / `1.8.2.18` → 1.8.2.20** 감지를 실제 업데이터로 확인했다. 태그·manifest·EXE·blockmap의 버전·크기·SHA-256이 빌드 원본과 일치한다.
- 기존 설치본은 앱 업데이트를 적용해야 한다. 기존 서명 APK 1.8.1.39를 포함하며 새 APK·Store·Company 배포는 수행하지 않았다. 실제 외부 도메인의 경로 라우팅·GitHub 로그인은 변경하거나 검증하지 않았다.

| 공개 자산 | 크기(bytes) | SHA-256 |
| --- | ---: | --- |
| `Acedia-Setup-1.8.2.20-x64.exe` | 156371647 | `b95516983d9a2a881feeacb8a30d7d0623190139305666ad3e3a90a5db147e20` |
| `Acedia-Setup-1.8.2.20-x64.exe.blockmap` | 163642 | `88e328d7e96abf7ff10e9282dd24afefd1d915a5d40525a3d6dc82c6697e50b2` |
| `latest-exe.json` | 256 | `e8f1cee3692999ffc51a883534fcedd1a9d1cb0adbba05406ee7c86f3567b9a9` |
