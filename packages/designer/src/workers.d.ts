/** Vite 的 `?worker` 导入：designer 是源码包，tsc 不认识 Vite 的模块类型。 */
declare module '*?worker' {
  const WorkerFactory: new (options?: { name?: string }) => Worker;
  export default WorkerFactory;
}
