/**
 * 设计时内核（DESIGN-v1 §12.13）：**零框架**。
 *
 * 这里放的是 React 版与 Vue 版编辑器都要用的东西：会话状态、命令网关、拖拽装配、
 * iframe 桥、命中与几何、大纲算法、样式解析、属性行解析、setter 注册表。
 *
 * 硬约束（G1）：本包 `src` 内 grep 不到 `react` / `vue` / `@radix-ui` / `lucide`。
 * 视图（面板、控件、图标）属于 `designer-react` / `designer-vue`，不进这里。
 */
export {
  computeSelectionBoxes,
  findNodeElement,
  frameOrigin,
  measureFloatAnchor,
} from './borders';
export type { BorderBox, FloatAnchor, SelectionBoxes, SelectionBoxInput } from './borders';
export { cloneNodeSchema } from './clone';
export { nearestScroller, nodeAt, rectToHost, revealNode, followTransitions } from './dom';
export { createDesignerDropContext } from './drop-context';
export type { DropContextDeps } from './drop-context';
export { BAR_HEIGHT, anchorOnScreen, placeFloatBar, placePopup } from './float-bar';
export type {
  FloatBarPlacement,
  FloatBarSide,
  PlaceFloatBarInput,
  PlacePopupInput,
  PopupPlacement,
  PopupSide,
  Size,
} from './float-bar';
export {
  PAGE_LABEL,
  PARENT_CHAIN_LIMIT,
  buildHierarchy,
  describeItem,
  parentChain,
} from './hierarchy';
export type { HierarchyItem, HierarchySource } from './hierarchy';
export { buildPropertyModel, isBuiltinSetterKind, resolvePropControl } from './props';
export type { PropControlKind, PropControlSpec, PropertyModel, PropertyRowModel } from './props';
export { defaultInsertTemplate } from './materials';
export type { MaterialLookup, MaterialMetaLike } from './materials';
export {
  ANY_FLAVOR,
  SetterRegistry,
  defaultSetterRegistry,
  loadSetters,
  registerSetter,
  setterKindOf,
  setterRefProps,
  unregisterSetter,
} from './setter-registry';
export type {
  RegisteredSetter,
  RegisterSetterOptions,
  SetterContext,
  SetterEntryMeta,
  SetterFlavor,
  SetterImpl,
  SetterInput,
  SetterMatch,
  SetterModule,
  SetterProps,
  SetterRegistration,
  SetterRegistryOptions,
  SetterScope,
} from './setter-registry';
export {
  NUMERIC,
  addUnit,
  formatBgImgUrl,
  isNil,
  isVarBind,
  multiPart,
  pairValue,
  parseBgImgUrl,
  parseToStyleData,
  removeUnit,
  splitUnit,
  styleToCssCode,
  toCamel,
  toKebab,
  toText,
} from './style';
export { CANVAS_DEVICES, DesignerSession } from './session';
export type {
  CanvasDevice,
  DataSourceEditing,
  DesignerSessionOptions,
  DesignerSnapshot,
} from './session';
export { collapsedByDefault, collapsibleIds, nodeLabel, nodeText } from './tree';
export { flattenVisible, INDENT, keepPaths, rowBox, stepRow } from './tree-layout';
export {
  clearError,
  getStoredError,
  reportError,
  subscribeError,
} from './error-store';
export type { StoredError } from './error-store';
