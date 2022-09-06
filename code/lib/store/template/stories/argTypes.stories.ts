import globalThis from 'global';
import { PartialStoryFn, PlayFunctionContext, StoryContext } from '@storybook/csf';
import { within } from '@storybook/testing-library';
import { expect } from '@storybook/jest';

export default {
  component: globalThis.Components.Pre,
  // Compose all the argTypes into `object`, so the pre component only needs a single prop
  decorators: [
    (storyFn: PartialStoryFn, context: StoryContext) =>
      storyFn({ args: { object: context.argTypes } }),
  ],
  argTypes: {
    componentArg: { type: 'string' },
    storyArg: { type: 'string' },
    composedArg: { type: 'string' },
  },
};

export const Inheritance = {
  argTypes: {
    storyArg: { type: 'number' },
    composedArg: { options: ['a', 'b'] },
  },
  play: async ({ canvasElement }: PlayFunctionContext) => {
    // NOTE: these stories don't test project-level argTypes inheritance as it is too problematic
    // to have an argType floating around that will apply too *all* other stories in our sandboxes.
    await expect(JSON.parse(within(canvasElement).getByTestId('pre').innerHTML)).toMatchObject({
      componentArg: { type: { name: 'string' } },
      storyArg: { type: { name: 'number' } },
      composedArg: { type: { name: 'string' }, options: ['a', 'b'] },
    });
  },
};

// Check the inferred arg types from the args
export const ArgTypeInference = {
  args: {
    a: 1,
    b: '1',
    c: true,
    d: { a: 'b' },
    e: ['a', 'b'],
  },
  play: async ({ canvasElement }: PlayFunctionContext) => {
    await expect(JSON.parse(within(canvasElement).getByTestId('pre').innerHTML)).toMatchObject({
      a: { type: { name: 'number' } },
      b: { type: { name: 'string' } },
      c: { type: { name: 'boolean' } },
      d: { type: { name: 'object', value: { a: { name: 'string' } } } },
      e: { type: { name: 'array', value: { name: 'string' } } },
    });
  },
};

// Check the inferred controls from the arg types
export const ControlInference = {
  argTypes: {
    a: { type: 'number' },
    b: { type: 'string' },
    c: { type: 'boolean' },
    d: { type: 'object' },
  },
  play: async ({ canvasElement }: PlayFunctionContext) => {
    await expect(JSON.parse(within(canvasElement).getByTestId('pre').innerHTML)).toMatchObject({
      a: { control: { type: 'number' } },
      b: { control: { type: 'text' } },
      c: { control: { type: 'boolean' } },
      d: { control: { type: 'object' } },
    });
  },
};
