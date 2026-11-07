declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}

/** 全局样式（非 CSS Module），只用于副作用导入，例如 designer-ui 的 tokens.css */
declare module '*.css';
