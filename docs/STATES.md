# P0 状态清单与证据状态

| state | 游戏内对应 | dump 节点 | 布局/资产 | 判定 |
|---|---|---:|---|---|
| entrance | TarotBookMainEntrancePage | 342 | 编译通过 | READY（无动画） |
| catalog | TarotBookRealMainPage | 457 | 编译通过 | READY（无动画） |
| bookletCover | TarotBookBookletPage / Cover | 410 | 编译通过 | READY（无动画） |
| bookletPage | TarotBookBookletPage / Page | 410 | 编译通过 | READY（无动画） |
| talk | TarotBookMimiTalkPage | 271 | 编译通过 | READY（无动画） |
| wikiDialog | TarotBookWikiDialog / Normal | 246 | 编译通过 | READY（无动画） |
| wikiError | TarotBookWikiDialog / Error | 246 | 编译通过 | READY（无动画） |
| mail | TarotBookMailDialog | 118 | 编译通过 | READY（无动画） |
| star | TarotBookStarPanelPage | 147 | 编译通过 | READY（无动画） |
| reward | TarotBookQuestRewardPage | 336 | 编译通过 | READY（无动画） |

`READY` 表示静态几何、源 sprite、字体与可导航运行时就绪；不包含 M5 动画与 M6 特效保真。

