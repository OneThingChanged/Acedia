---
type: Release
title: Acedia 1.8.1.95
status: published
last_updated: 2026-10-25
---

# Acedia 1.8.1.95

- 자식 세션의 HTML/Markdown 상대경로 링크를 상위 프로젝트 폴더에서 찾던 문제를 수정했다. 해당 세션의 작업 폴더와 폴더 상속 설정을 적용한다.
- 프로젝트가 `RnDHub`, 자식 작업 폴더가 `RnDHub/RnDProject`이면 `Saved/Tests/index.html`을 자식 폴더에서 찾고, 문서 탭에는 `RnDProject/Saved/Tests/index.html`로 변환해 전달한다. 부모에 같은 이름의 파일이 있어도 자식의 파일을 연다.
- 상대경로 폴더 링크에도 세션의 작업 폴더를 적용한다. Ctrl/Cmd+클릭의 절대 경로와 기존 프로젝트 밖 문서의 외부 열기 동작은 유지한다.

Standard EXE 업데이트다. 번들 Android APK는 기존 서명 검증본 **1.8.1.39/code 21**을 재사용한다.

## English

- Fix relative HTML and Markdown links in child sessions being resolved against the parent project folder. Use the session's effective working folder, including inherited folder settings.
- Translate the resolved file back to the registered project's relative path before opening its document tab. A child report opens correctly even if the parent has a file with the same name.
- Apply the session working folder to relative folder links too. Preserve Ctrl/Cmd-click absolute targets and external opening for documents outside the registered project.

This Standard EXE reuses the existing signed Android **1.8.1.39/code 21** artifact.

## 검증

- 부모·자식의 같은 이름 보고서, 여러 단계 폴더 상속, 절대 경로와 외부 문서 경계를 포함한 관련 검사 **42개** 통과.
- 실제 `RnDProject` 보고서를 변환한 프로젝트 상대경로로 조회해 미리보기 **HTTP 200**과 원본 파일 내용 일치를 확인했다. 사용자 세션을 재시작하거나 설치 앱을 조작하지 않았다.
- TypeScript·Vite production build와 기존 터미널 링크 클릭 검사를 통과했다. `output/child-session-links-build.log`, `output/child-session-links-terminal-smoke.log`.
- PC 전체 **207개 파일·1,586개 검사** 통과. `output/exe-95-tests.log`.
- PC 의존성 보안 검사에서 취약점 **0개**를 확인했다. `output/exe-95-audit.log`.
- 실제 Electron의 세션·프로젝트 생성 상호작용과 **18개 화면 조합**, 조직·폴더 이동·재개·동기화, 세션 사용량, 터미널 링크·native PTY 검사를 통과했다. `output/exe-95-electron-*.log`.
- native PTY 성공 표식과 종료 코드 0을 확인했다. 종료 시 기존 `AttachConsole failed` 진단 출력이 남았으며, 입출력 검사 실패와 구분했다.
- TypeScript·Vite production build와 NSIS 설치 파일·blockmap·EXE 업데이트 manifest 생성을 완료했다. `output/exe-95-build.log`.
- packaged bridge·Dashboard·내장 Git·종료·트레이·보안 검사를 통과했다. 런타임·렌더러 **338개 파일**이 고정 소스와 일치한다. `output/exe-95-packaged-smoke.log`, `output/exe-95-packaged-lifecycle-smoke.log`, `output/exe-release-1.8.1.95/local-verification.json`.
- 공개 업데이터에서 **1.8.1.94·1.8.1.93·1.8.1.89 → 1.8.1.95** 감지를 확인하고 설치 파일 전체를 다운로드했다. 세 자산의 크기·SHA-256·공식 URL·소스 태그와 최신 안정 릴리스를 검증했다. `output/exe-95-public-verify.log`.

## 배포 기록

- EXE 공개 게시: **2026-10-25 21:37:38 KST**. [GitHub Release v1.8.1.95](https://github.com/OneThingChanged/Acedia/releases/tag/v1.8.1.95).
- 공개 다운로드 검증 완료: **2026-10-25 21:38:30 KST**.
- 고정 제품 소스·태그: `15e4b8bbc8d2e382867eda5e655b4a05d4835b8f`.
- Windows 설치 파일 FileVersion **1.8.1.95**, ProductVersion **1.8.1**, Authenticode **NotSigned** 확인.
- 번들 APK는 기존 **1.8.1.39/code 21**이며 인증서·패키지·아키텍처·해시를 검증했다. 새 APK·Microsoft Store·Company 배포는 실행하지 않았다.
- 설치 프로그램을 실행하거나 사용 중인 앱을 교체·재시작하지 않았다. 설정의 **Check → Update**로 설치형 업데이트를 적용한다.

| 공개 자산 | 바이트 | SHA-256 |
| --- | ---: | --- |
| Acedia-Setup-1.8.1.95-x64.exe | 156176370 | `e893f05d20ff38302260aafcbc0b23efb7498c0695243a210b75355638eb94ff` |
| Acedia-Setup-1.8.1.95-x64.exe.blockmap | 163398 | `76485a543011ea574e34f6e45e4b4d725e34715124954881d7734b0082ecad11` |
| latest-exe.json | 256 | `b309604858c00e3becb925d99b9a4e26292a38164fbad40ceafec551b8a4b7cd` |
