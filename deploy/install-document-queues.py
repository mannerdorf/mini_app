#!/usr/bin/env python3
"""Replace only refresh-cache jobs; preserve every unrelated cron entry and save a backup."""
from datetime import datetime
from pathlib import Path
import re
import subprocess

pattern = re.compile(r'/api/cron/refresh-cache(?=[?\s\'"\n]|$)')
result = subprocess.run(['crontab', '-l'], text=True, capture_output=True)
if result.returncode != 0:
    raise SystemExit('Не удалось прочитать существующий crontab. Ничего не изменено.')
old = result.stdout
if not any(pattern.search(line) and not line.lstrip().startswith('#') for line in old.splitlines()):
    raise SystemExit('Нет существующего refresh-cache: проверьте, что это cron-VPS. Ничего не изменено.')
backup = Path.home() / ('crontab-before-document-queues-' + datetime.now().strftime('%Y%m%d-%H%M%S') + '.txt')
backup.write_text(old)
example = Path(__file__).with_name('crontab.haulz-cron.example').read_text()
jobs = [line for line in example.splitlines() if pattern.search(line) and not line.lstrip().startswith('#')]
assert len(jobs) == 8, 'Unexpected queue schedule'
kept = [line for line in old.splitlines() if not pattern.search(line) or line.lstrip().startswith('#')]
new = '\n'.join(kept + ['# Independent document queues'] + jobs) + '\n'
subprocess.run(['crontab', '-'], input=new, text=True, check=True)
print('Расписание обновлено. Резервная копия:', backup)
