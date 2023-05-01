import * as dotenv from 'dotenv'; // see https://github.com/motdotla/dotenv#how-do-i-use-dotenv-with-import
dotenv.config();
import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'http://localhost:3000/api/graphql',
  documents: ['gql/**/*.graphql'],
  generates: {
    './__generated__/gql.ts': {
      plugins: ['typescript', 'typescript-operations', 'typed-document-node'],
    },
    './__generated__/signed-operations.json': {
      plugins: ['graphql-codegen-signed-operation'],
      config: {
        // should be long and not exposed to public
        secret: process.env.SIGNING_SECRET,
      },
    },
  },
};
export default config;
