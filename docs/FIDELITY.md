# 保真度差异登记

## 已确认限制

- 静态 block 中部分 GameObject / RectTransform 的 typetree 被裁剪；UnityPy 不能完整反序列化这些对象。不得把裁剪结果当成零尺寸或空布局。
- `source-dump/probe-prefab-json` 的 split JSON 有父子链，但没有 anchor、pivot、sizeDelta、anchoredPosition，不能作为几何真相。
- 路径 A 静态导出无法得到运行时生成的节点和 TMP 逐字 quad；按手册 7.7，Text quad 断言可降级为 warn，但必须在本文登记。
- 完整游戏截图只能人工验收，不能进入 `app/`，不得作为渲染源。

## 待登记项

当前没有进入 M3/M4 的状态，因此尚无 L1–L4 保真度测量数据。每项差异必须在取得证据完整的 dump 后补充来源路径与误差。
