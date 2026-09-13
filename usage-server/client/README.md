# Acedia Usage — 사용자 설치

1. Node.js 22.13 이상을 설치하고 Codex에 로그인해 한 번 실행합니다.
2. 이 ZIP을 풀고 install.cmd를 실행합니다.
3. 관리자가 전달한 서버 주소와 15분 유효한 일회용 등록 코드를 입력합니다. Codex 홈은 기본값을 사용하거나 실제 CODEX_HOME 폴더를 지정합니다.
4. 사내 HTTP 서버는 LAN 모드 질문에 y를 입력해야 합니다. HTTP는 암호화되지 않으며 사설 IPv4 주소만 허용합니다. HTTPS는 별도 허용이 필요 없습니다.
5. 설치 완료 메시지의 두 codex plugin 명령을 실행하면 Codex에도 플러그인이 등록됩니다. 새 세션에서 활성화합니다. 수집 자체는 독립 watcher로 이미 시작됩니다.

설치 위치: %LOCALAPPDATA%/AcediaUsageClient. 연결 정보: %LOCALAPPDATA%/AcediaUsage. 같은 Windows 사용자의 기존 등록을 덮어쓰지 않습니다. 설치 중 실패했다면 같은 서버·Codex 홈으로 다시 실행합니다.
재부팅 후 설치 폴더의 run.cmd를 실행하거나 등록된 플러그인을 사용하는 Codex 세션을 엽니다. OS 자동 시작 서비스는 설치하지 않습니다. 원본 ZIP은 다른 직원에게 재사용할 수 있지만 설치된 폴더·연결 정보는 복사하지 마세요.

토큰 수치, 로그인 계정 식별자, 모델·effort, Windows 사용자·PC·로컬 IP와 관측 한도를 전송합니다. 대화 내용과 인증 토큰은 서버로 보내지 않습니다. 설치 이후 사용량부터 수집합니다. 현재 Codex CLI용이며 Claude와 일반 ChatGPT 채팅 자동 수집은 제공하지 않습니다.
