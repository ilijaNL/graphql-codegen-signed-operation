# GraphQL-Codegen-Signed-Operation

A plugin for [https://the-guild.dev/graphql/codegen](graphql-codegen) to create a signature from your documents which can be validated on the server

## Install

Install graphql-code-generator and this plugin

    yarn add -D @graphql-codegen/cli @graphql-codegen/typescript @graphql-codegen/typescript-operations graphql-codegen-signed-operation

## Usage

Create codegen.ts

```ts
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
```

### Using the signed operation hash

When sending an request to the graphQL server, add the signed operation hash to some header.

Example for apollo client:

```ts
import { ApolloClient, createHttpLink, InMemoryCache } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import OperationHashes from '@/__generated__/operations.json';

const httpLink = createHttpLink({
  uri: '/graphql',
});

const link = setContext(({ operationName }, { headers }) => {
  // return the headers to the context so httpLink can read them
  const hash = OperationHashes[operationName];
  if (!hash) {
    //throw
  }
  return {
    headers: {
      'x-operation-hash': hash,
    },
  };
});

const client = new ApolloClient({
  link: link.concat(httpLink),
  cache: new InMemoryCache(),
});
```

### Validate on the Server

On your server validate if the incoming operation matches the signature by using the secret defined in the `codegen.ts` file.

```ts
import { createHmac } from 'node:crypto';
import { printExecutableGraphQLDocument } from '@graphql-tools/documents';
import { parse } from 'graphql';

const hashHeader = req.headers['x-operation-hash'];
const query = req.body.query;
// using printExecutableGraphQLDocument from @graphql-tools/documents ensures we have a stable query string
const stableQuery = printExecutableGraphQLDocument(parse(query));
const expectedHash = createHmac('sha256', process.env.SIGNING_SECRET).update(stableQuery).digest('hex');

if (expectedHash !== hashHeader) {
  // reject the request
}
```
