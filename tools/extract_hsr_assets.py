#!/usr/bin/env python3
"""Generate reproducible Parallels guest scripts for HSR bundle indexing/export.

The host only writes scripts into the shared folder. Run each printed command
from the host; the actual Unity bundle parsing runs inside the Windows VM.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path

GAME = r"C:\Program Files\miHoYo Launcher\games\Star Rail Game\StarRail_Data\StreamingAssets\Asb\Windows"
VM = "{37aacf46-7b72-45a9-aa08-5682d1f06c04}"
CLI = r"Z:\Downloads\hsr-ui-extract\animestudio\cli\AnimeStudio.CLI.exe"
DOTNET = r"C:\ProgramData\hsr-dotnet-x64"
SHARE = Path("/Users/ntars/Downloads/hsr-ui-extract")
GUEST = r"Z:\Downloads\hsr-ui-extract"

HEADER = """$env:DOTNET_ROOT = '{dotnet}'
$env:PATH = '{dotnet};' + $env:PATH
"""

ASSET_MAP = r"""$cliArgs = @(
  '{game}',
  '{guest}\animestudio\out-fullmap',
  '--game','SR','--map_op','AssetMap','--map_type','JSON','--map_name','hsr_all'
)
& '{cli}' @cliArgs 2>&1 | Tee-Object -FilePath '{guest}\animestudio\fullmap.log'
"""

EXPORT = r"""$cliArgs = @(
  '{source}',
  '{dest}',
  '--game','SR',{extra}'--export_type','{export_format}','--group_assets','ByContainer',{types}
)
& '{cli}' @cliArgs 2>&1 | Tee-Object -FilePath '{log}'
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['map', 'export'])
    parser.add_argument('--block', help='block filename for export mode')
    parser.add_argument('--names', help='optional name regex for export mode')
    parser.add_argument('--types', default='Texture2D',
                        help='comma-separated Unity asset types; default Texture2D')
    parser.add_argument('--source', default='hitblocks',
                        help='export from copied hitblocks or the full game Asb directory')
    parser.add_argument('--dest', default='tarot-export-full',
                        help=r'guest output folder under Z:\Downloads\hsr-ui-extract')
    parser.add_argument('--export-format', default='Convert', choices=['Convert', 'Dump', 'JSON', 'Raw'], help='AnimeStudio export format')
    parser.add_argument('--execute', action='store_true', help='call prlctl with the generated script')
    args = parser.parse_args()

    if args.mode == 'map':
        body = ASSET_MAP.format(game=GAME, guest=GUEST, cli=CLI)
        script = SHARE / 'generate_asset_map.ps1'
    else:
        if not args.block:
            parser.error('--block is required for export')
        extra = "'--names','" + args.names + "'," if args.names else ""
        source = (GAME + '\\' + args.block if args.source == 'game' else args.source if args.source.startswith(('C:', 'Z:')) else GUEST + r'\hitblocks' + '\\' + args.block)
        dest = GUEST + '\\' + args.dest
        types = ''
        if args.types:
            types = "'--types'," + ",".join("'" + t.strip() + "'" for t in args.types.split(','))
        body = EXPORT.format(source=source, dest=dest, extra=extra, types=types, cli=CLI, export_format=args.export_format,
                             log=GUEST + '\\extract-' + args.dest.replace('/', '_').replace('\\', '_') + '.log')
        script = SHARE / f'extract_{Path(args.block).stem}.ps1'
    script.write_text(HEADER.format(dotnet=DOTNET) + body, encoding='utf-8')
    command = ['prlctl', 'exec', VM, '--current-user', 'powershell',
               '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
               str(script).lstrip('/').replace('/', '\\')]
    printable = list(command)
    printable[-1] = str(script)
    print(' '.join(printable))
    if args.execute:
        # prlctl 的 PowerShell -File 参数在部分 guest 区域设置下会丢失路径；
        # 用 -Command 调用脚本可以稳定执行同一份导出脚本。
        import subprocess
        # 宿主绝对路径形如 /Users/...，guest 内可直接用 `/Users/...` 形式路径；
        # 去掉开头的盘符式斜杠会破坏 PowerShell 的路径识别。
        guest_script = str(script)
        command = ['prlctl', 'exec', VM, '--current-user', 'powershell',
                   '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
                   f"& '{guest_script}'"]
        raise SystemExit(subprocess.call(command))


if __name__ == '__main__':
    main()
