import tap from 'tap';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { GraphQLSignedOperationPluginOptions as Config } from '../src/config';
import { DocumentNode, parse } from 'graphql';
import { plugin, validate } from '../src/plugin';
import { createHmac } from 'node:crypto';
import { printExecutableGraphQLDocument } from '@graphql-tools/documents';

const schema = makeExecutableSchema({
  typeDefs: `
    type User {
      name: String!
      id: String!
      friends: [Friend!]!
    }
    type Friend {
      id: String!
      user: User!
    }
    type Query {
      test: String!
      user: User!
    }
    type Mutation {
      create: String!
    }
`,
});

// Nooop gql fn for prettier
function gql(...things: TemplateStringsArray[]) {
  return things.join('');
}

function toSignedHash(query: string, secret: string, algo = 'sha256') {
  const stableQuery = printExecutableGraphQLDocument(parse(query));
  return createHmac(algo, secret).update(stableQuery).digest('hex');
}

async function runPlugin(docs: DocumentNode[], config: Config, file = 'dummy.json') {
  // const documents = docs.map((doc: any) => ({
  //   filePath: '',
  //   content: doc,
  // }));
  const d = docs.map((d) => ({ document: d }));

  await validate(schema, d, config, file, []);

  return plugin(schema, d, config);
}

tap.test('query', async (t) => {
  const parsedDocument = parse(gql`
    query test {
      test
    }
  `);
  const secret = 'abcde';
  const result = await runPlugin(
    [
      parsedDocument,
      parse(
        gql`
          query t1 {
            user {
              id
              name
            }
          }
        `
      ),
      parse(
        gql`
          query t2 {
            user {
              name
              id
            }
          }
        `
      ),
    ],
    { secret: secret }
  );

  t.matchSnapshot(result.content);

  const map = JSON.parse(result.content);
  const hash = map['test'];

  // wrong secret
  t.not(hash, createHmac('sha256', 'abcd').update(printExecutableGraphQLDocument(parsedDocument)).digest('hex'));
  // correct secret
  t.equal(
    hash,
    createHmac('sha256', secret).update(printExecutableGraphQLDocument(parsedDocument)).digest('hex'),
    printExecutableGraphQLDocument(parsedDocument)
  );
});

tap.test('should be stable if the order is different', async (t) => {
  const secret = '12344566';
  const result = await runPlugin(
    [
      parse(gql`
        fragment user on User {
          name
          id
        }
      `),
      parse(gql`
        query user {
          user {
            ...user
          }
        }
      `),
    ],
    {
      secret: secret,
    }
  );

  const map = JSON.parse(result.content);
  const hash = map['user'];
  t.equal(
    hash,
    toSignedHash(
      gql`
        query user {
          user {
            ...user
          }
        }

        fragment user on User {
          id
          name
        }
      `,
      secret
    )
  );
});

tap.test('algorithm', async (t) => {
  const secret = '12344566';
  const result = await runPlugin(
    [
      parse(gql`
        fragment user on User {
          name
          id
        }
      `),
      parse(gql`
        query user {
          user {
            ...user
          }
        }
      `),
    ],
    {
      secret: secret,
      algorithm: 'md5',
    }
  );

  const map = JSON.parse(result.content);
  const hash = map['user'];

  t.not(
    hash,
    toSignedHash(
      gql`
        query user {
          user {
            ...user
          }
        }

        fragment user on User {
          id
          name
        }
      `,
      secret,
      'sha256'
    )
  );

  t.equal(
    hash,
    toSignedHash(
      gql`
        query user {
          user {
            ...user
          }
        }

        fragment user on User {
          id
          name
        }
      `,
      secret,
      'md5'
    )
  );
});

tap.test('throws when no operationName', async (t) => {
  t.rejects(
    () =>
      runPlugin(
        [
          parse(gql`
            query {
              user {
                id
                name
              }
            }
          `),
        ],
        {
          secret: '123',
        }
      ),
    new Error('graphql-codegen-signed-operation requires all operations to have operationName')
  );
});

tap.test('throws when fragment not defined', async (t) => {
  t.rejects(() =>
    runPlugin(
      [
        parse(gql`
          query user {
            user {
              ...user
            }
          }
        `),
      ],
      {
        secret: '123',
      }
    )
  );
});

tap.test('throws when invalid config', async (t) => {
  t.rejects(
    async () =>
      await runPlugin(
        [
          parse(gql`
            query cUser {
              user {
                id
              }
            }
          `),
          parse(gql`
            query cUser {
              user {
                name
              }
            }
          `),
        ],
        {} as any
      )
  );

  t.rejects(
    async () =>
      await runPlugin(
        [
          parse(gql`
            query cUser {
              user {
                id
              }
            }
          `),
          parse(gql`
            query cUser {
              user {
                name
              }
            }
          `),
        ],
        { secret: '' }
      )
  );

  t.rejects(
    async () =>
      await runPlugin(
        [
          parse(gql`
            query cUser {
              user {
                id
              }
            }
          `),
          parse(gql`
            query cUser {
              user {
                name
              }
            }
          `),
        ],
        { secret: '' },
        'file.txt'
      )
  );
});

tap.test('throws on duplicate operations', async (t) => {
  t.rejects(
    async () =>
      await runPlugin(
        [
          parse(gql`
            query cUser {
              user {
                id
              }
            }
          `),
          parse(gql`
            query cUser {
              user {
                name
              }
            }
          `),
        ],
        { secret: 'abc' }
      )
  );
});
