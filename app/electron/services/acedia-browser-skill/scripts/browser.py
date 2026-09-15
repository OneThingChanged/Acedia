"""Connect to the owning Acedia browser without exposing session credentials."""
import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['tabs', 'open', 'show', 'snapshot'])
    parser.add_argument('--url')
    parser.add_argument('--tab-id')
    parser.add_argument('--profile-id')
    parser.add_argument('--placement', choices=['right', 'tab'], default='right')
    args = parser.parse_args()
    port, token, agent = (os.environ.get(key, '').strip() for key in
                          ['MULTIAGENT_PORT', 'MULTIAGENT_TOKEN', 'MULTIAGENT_AGENT_ID'])
    if not port.isdigit() or not 1 <= int(port) <= 65535 or not token or not agent:
        parser.exit(1, 'Acedia session bridge environment is missing. Run inside an Acedia session.\n')
    if args.action in ['show', 'snapshot'] and not args.tab_id:
        parser.error('--tab-id is required for show/snapshot')
    body = {}
    if args.action in ['open', 'show']:
        body['placement'] = args.placement
    if args.action == 'open':
        if args.url:
            body['url'] = args.url
        if args.profile_id:
            body['profileId'] = args.profile_id
    if args.tab_id:
        body['tabId'] = args.tab_id
    action = 'status' if args.action == 'tabs' else args.action
    url = f'http://127.0.0.1:{port}/integration/v1/browser/{urllib.parse.quote(agent, safe="")}/{action}'
    data = None if args.action == 'tabs' else json.dumps(body).encode('utf-8')
    request = urllib.request.Request(url, data=data, headers={
        'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    # This is a loopback-only API; do not send credentials through configured proxies.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(request, timeout=25) as response:
            payload = json.load(response)
        print(json.dumps(payload, ensure_ascii=True))
        return 1 if payload.get('ok') is False else 0
    except urllib.error.HTTPError as error:
        try:
            payload = json.load(error)
            print(json.dumps({'ok': False, 'error': payload.get('error', f'HTTP {error.code}')}, ensure_ascii=True), file=sys.stderr)
        except (ValueError, OSError):
            print(f'Acedia browser request failed: HTTP {error.code}', file=sys.stderr)
        return 1
    except (OSError, ValueError):
        print('Could not reach the local Acedia browser bridge.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
