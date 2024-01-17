import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import type { PlopTypes } from '@turbo/gen'

export default function generator(plop: PlopTypes.NodePlopAPI): void {
  plop.setGenerator('Create workspace', {
    description: 'Create a new workspace',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'name for the workspace (example: eslint-config-neon, web)',
        validate(input: string) {
          const packageNameRegexp = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/

          if (!packageNameRegexp.test(input)) {
            return 'Not available for workspace name.'
          }
          if (input.includes(' ')) {
            return 'Workspace name cannot include spaces'
          }
          if (!input) {
            return 'Workspace name is required'
          }
          return true
        },
      },
      {
        type: 'input',
        name: 'folderName',
        message: 'Workspace folder name',
        validate(input: string) {
          // eslint-disable-next-line no-useless-escape
          const folderRegexp = /^[a-z\-]+$/

          if (!folderRegexp.test(input)) return 'Now allowed folder name'

          if (!input) {
            return 'Workspace name is required'
          }

          return true
        },
      },
      {
        type: 'input',
        name: 'description',
        message:
          'description for the package/workspaces (example: "Create the `turbo.json` file from an existing "turbo" key in `package.json`")',
      },
      {
        name: 'type',
        message: 'Choose generate type',
        type: 'list',
        choices: [
          {
            name: 'App (apps/name)',
            type: 'choice',
            value: 'apps',
          },
          {
            name: 'Package (packages/name)',
            type: 'choice',
            value: 'packages',
          },
        ],
      },
    ],
    actions: [
      {
        type: 'add',
        path: '{{type}}/{{folderName}}/package.json',
        templateFile: 'templates/package.json',
      },
      {
        type: 'add',
        path: '{{type}}/{{folderName}}/.eslintrc.json',
        templateFile: 'templates/template.eslintrc.json',
      },
      {
        type: 'add',
        path: '{{type}}/{{folderName}}/.lintstagedrc.cjs',
        templateFile: 'templates/template.lintstagedrc.cjs',
      },
      {
        type: 'add',
        path: '{{type}}/{{folderName}}/.prettierrc.cjs',
        templateFile: 'templates/template.prettierrc.cjs',
      },
      {
        type: 'addMany',
        destination: '{{type}}/{{folderName}}/',
        base: 'templates/package/',
        templateFiles: 'templates/package/**',
      },
      async function createSourcefile(answers: { type?: string; folderName?: string }) {
        const { type, folderName } = answers
        console.log('Creating src data')

        await Promise.all([mkdir(join(type!, folderName!, 'src'))])

        await writeFile(join(type!, folderName!, 'src', 'index.ts'), `console.log('Hello world!')`)

        return 'Done!'
      },
    ],
  })
}
