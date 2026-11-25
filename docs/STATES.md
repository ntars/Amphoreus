# P0 状态清单与证据状态

| state | 游戏内对应 | 当前证据 | 判定 |
|---|---|---|---|
| entrance | TarotBookMainEntrancePage | `dump/entrance.json` 23 个节点，源自主 block | BLOCKED：节点数 < 50，组件缺失 |
| catalog | TarotBookMainCatalogPanel | 仅资产与 Lua 名称线索 | BLOCKED：无完整 dump |
| bookletCover | TarotBookCoverPanel / TBBookletCoverPage | 仅资产与 Lua 名称线索 | BLOCKED：无完整 dump |
| bookletPage | TarotBookBookletPage | 仅资产与 Spine 文件 | BLOCKED：无完整 dump |
| talk | TarotBookMimiTalkPage | 仅资产与动画文件 | BLOCKED：无完整 dump |
| wikiDialog | TarotBookWikiDialog | 仅资产与动画文件 | BLOCKED：无完整 dump |
| wikiError | TarotBookWikiDialog error 态 | 仅资产与动画文件 | BLOCKED：无完整 dump |
| mail | TarotBookMailBoxPage / MailDialog | 仅资产与动画文件 | BLOCKED：无完整 dump |
| star | TarotBookStarPage / StarPanel | 仅资产与动画文件 | BLOCKED：无完整 dump |
| reward | TarotBookRewardMainPage | 仅资产与动画文件 | BLOCKED：无完整 dump |

`BLOCKED` 状态不提供导航入口，也不允许用近似坐标生成页面。
