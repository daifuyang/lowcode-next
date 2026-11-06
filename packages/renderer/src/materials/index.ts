import type { MaterialDefinition } from '../registry';
import {
  Div,
  Stack,
  Grid,
  Section,
  Card,
  divMaterial,
  stackMaterial,
  gridMaterial,
  sectionMaterial,
  cardMaterial,
} from './layout';
import {
  Heading,
  Text,
  Button,
  Link,
  Badge,
  Icon,
  Divider,
  Image,
  Spacer,
  headingMaterial,
  textMaterial,
  buttonMaterial,
  linkMaterial,
  badgeMaterial,
  iconMaterial,
  dividerMaterial,
  imageMaterial,
  spacerMaterial,
} from './base';
import {
  Navbar,
  Hero,
  FeatureCard,
  Stat,
  CodeBlock,
  Footer,
  navbarMaterial,
  heroMaterial,
  featureCardMaterial,
  statMaterial,
  codeBlockMaterial,
  footerMaterial,
} from './blocks';
import './materials.css';

/**
 * 内置物料清单。
 *
 * 顺序即物料面板里的展示顺序：先布局（搭骨架用的），再基础（填内容用的），
 * 最后区块（整段快捷方式）。分组标题取 meta.group。
 */
export const builtinMaterials: MaterialDefinition[] = [
  // 布局
  { meta: divMaterial, component: Div },
  { meta: stackMaterial, component: Stack },
  { meta: gridMaterial, component: Grid },
  { meta: sectionMaterial, component: Section },
  { meta: cardMaterial, component: Card },

  // 基础
  { meta: headingMaterial, component: Heading },
  { meta: textMaterial, component: Text },
  { meta: buttonMaterial, component: Button },
  { meta: linkMaterial, component: Link },
  { meta: badgeMaterial, component: Badge },
  { meta: iconMaterial, component: Icon },
  { meta: imageMaterial, component: Image },
  { meta: dividerMaterial, component: Divider },
  { meta: spacerMaterial, component: Spacer },

  // 区块
  { meta: navbarMaterial, component: Navbar },
  { meta: heroMaterial, component: Hero },
  { meta: featureCardMaterial, component: FeatureCard },
  { meta: statMaterial, component: Stat },
  { meta: codeBlockMaterial, component: CodeBlock },
  { meta: footerMaterial, component: Footer },
];

export { Div, Stack, Grid, Section, Card } from './layout';
export {
  Heading,
  Text,
  Button,
  Link,
  Badge,
  Icon,
  Divider,
  Image,
  Spacer,
} from './base';
export { Navbar, Hero, FeatureCard, Stat, CodeBlock, Footer } from './blocks';
export {
  divMaterial,
  stackMaterial,
  gridMaterial,
  sectionMaterial,
  cardMaterial,
  headingMaterial,
  textMaterial,
  buttonMaterial,
  linkMaterial,
  badgeMaterial,
  iconMaterial,
  imageMaterial,
  dividerMaterial,
  spacerMaterial,
  navbarMaterial,
  heroMaterial,
  featureCardMaterial,
  statMaterial,
  codeBlockMaterial,
  footerMaterial,
};
