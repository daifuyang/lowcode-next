import { describe, expect, it } from 'vitest';
import { parsePageSchema, pageSchema, SchemaValidationError } from './schema';
import { sampleSchema } from './sample';

describe('page schema', () => {
  it('接受合法 schema', () => {
    const parsed = parsePageSchema(sampleSchema);
    expect(parsed.componentsTree.children).toHaveLength(2);
  });

  it('允许 children 混排文本与节点', () => {
    const result = pageSchema.safeParse({
      version: '1.0.1',
      componentsMap: [],
      componentsTree: {
        id: 'root',
        componentName: 'Div',
        children: ['hello', { id: 'n1', componentName: 'Button' }],
      },
    });
    expect(result.success).toBe(true);
  });

  it('拒绝缺少 id 的节点', () => {
    const result = pageSchema.safeParse({
      version: '1.0.1',
      componentsMap: [],
      componentsTree: { componentName: 'Div' },
    });
    expect(result.success).toBe(false);
  });

  it('错误信息包含可读路径', () => {
    expect(() =>
      parsePageSchema({
        version: '1.0.1',
        componentsMap: [],
        componentsTree: {
          id: 'root',
          componentName: 'Div',
          children: [{ componentName: 'Button' }],
        },
      }),
    ).toThrow(SchemaValidationError);

    try {
      parsePageSchema({
        version: '1.0.1',
        componentsMap: [],
        componentsTree: {
          id: 'root',
          componentName: 'Div',
          children: [{ componentName: 'Button' }],
        },
      });
    } catch (err) {
      expect((err as SchemaValidationError).issues[0]).toContain(
        'componentsTree.children.0.id',
      );
    }
  });

  it('拒绝空的 componentName', () => {
    const result = pageSchema.safeParse({
      version: '1.0.1',
      componentsMap: [],
      componentsTree: { id: 'root', componentName: '' },
    });
    expect(result.success).toBe(false);
  });
});
