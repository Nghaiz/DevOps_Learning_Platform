import { describe, expect, it } from 'vitest';
import { describeLessonPath, inlineServerIssues, pathSegments, toLessonIssues } from './lesson-issues';

describe('pathSegments', () => {
  it('reads bracket and dotted indexes the same way', () => {
    expect(pathSegments('steps[2].weight')).toEqual(['steps', '2', 'weight']);
    expect(pathSegments('steps.2.weight')).toEqual(['steps', '2', 'weight']);
  });
});

describe('describeLessonPath', () => {
  it('maps a client step issue to its canonical path and a human name', () => {
    const target = describeLessonPath('lesson', 'steps[0].weight');
    expect(target.path).toBe('steps[0].weight');
    expect(target.field).toMatch(/^Bước 1, /);
    expect(target.field).not.toContain('steps');
  });

  it('maps the server dotted path of a lab task onto the client task path', () => {
    const target = describeLessonPath('lab', 'steps.1.verifyScript');
    expect(target.path).toBe('task[1].verifyScript');
    expect(target.field).toMatch(/^Task 2, /);
  });

  it('folds the server setup.foreground spelling into the step form field', () => {
    expect(describeLessonPath('lesson', 'steps[3].setup.foreground').path).toBe(
      'steps[3].setupForeground',
    );
  });

  it('keeps phase and lab setup paths in the dotted form the fields use', () => {
    expect(describeLessonPath('lesson', 'intro.setup.foreground').path).toBe(
      'intro.setup.foreground',
    );
    expect(describeLessonPath('lab', 'setup.background').path).toBe('setup.background');
    expect(describeLessonPath('lesson', 'finish.markdown').path).toBe('finish.markdown');
  });

  it('names top-level fields without exposing the data path', () => {
    const target = describeLessonPath('lesson', 'difficulty');
    expect(target.path).toBe('difficulty');
    expect(target.field).toBe('Độ khó');
  });

  it('does not offer a jump for a path no field owns', () => {
    const target = describeLessonPath('lesson', 'somethingElse.deep');
    expect(target.path).toBeNull();
    expect(target.field).toContain('somethingElse.deep');
  });

  it('names a whole-list issue without making it jumpable', () => {
    expect(describeLessonPath('lab', 'steps').path).toBeNull();
    expect(describeLessonPath('lesson', 'steps').path).toBeNull();
  });
});

describe('toLessonIssues / inlineServerIssues', () => {
  const raw = [
    { path: 'title', message: 'trống' },
    { path: 'nope', message: 'lạ' },
  ];

  it('marks only resolvable issues as jumpable', () => {
    const issues = toLessonIssues('lesson', raw);
    expect(issues.map((i) => i.jumpable)).toEqual([true, false]);
    expect(issues[1]?.path).toBe('nope');
  });

  it('drops unresolvable server issues from the inline set', () => {
    expect(inlineServerIssues('lesson', raw)).toEqual([{ path: 'title', message: 'trống' }]);
  });
});
