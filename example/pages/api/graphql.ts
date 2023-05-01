import { createYoga, createSchema } from 'graphql-yoga';
import { createHmac } from 'node:crypto';
import { printExecutableGraphQLDocument } from '@graphql-tools/documents';
import * as dotenv from 'dotenv'; // see https://github.com/motdotla/dotenv#how-do-i-use-dotenv-with-import
import { parse } from 'graphql';
import { NextApiRequest, NextApiResponse } from 'next';
dotenv.config();

const typeDefs = /* GraphQL */ `
  type Query {
    users: [User!]!
  }
  type User {
    name: String
  }
`;

const resolvers = {
  Query: {
    users() {
      return [{ name: 'Nextjsssss' }];
    },
  },
};

const schema = createSchema({
  typeDefs,
  resolvers,
});

const yoga = createYoga({
  schema,
  // Needed to be defined explicitly because our endpoint lives at a different path other than `/graphql`
  graphqlEndpoint: '/api/graphql',
});

export default async function handler(req: NextApiRequest, response: NextApiResponse) {
  const hashHeader = req.headers['x-operation-hash'];
  const query = req.body.query;

  // skip for introspection query
  if ((query as string).includes('IntrospectionQuery')) {
    return yoga(req, response);
  }

  const stableQuery = printExecutableGraphQLDocument(parse(query));
  const expectedHash = createHmac('sha256', process.env.SIGNING_SECRET).update(stableQuery).digest('hex');

  if (expectedHash !== hashHeader) {
    return response.status(404).send('invalid operation');
  }

  return yoga(req, response);
}
