import { print, getOperationAST } from 'graphql';
import { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { GetUsersDocument } from '../__generated__/gql';
import useSWR from 'swr';
import SignedOperations from '../__generated__/signed-operations.json';

const fetcher = <T, V>(doc: TypedDocumentNode<T, V>) => {
  const operationName = getOperationAST(doc).name.value;
  const hash = SignedOperations[operationName];
  return fetch('/api/graphql', {
    method: 'POST',
    headers: {
      'Content-type': 'application/json',
      // set the custom header here
      'x-operation-hash': hash,
    },
    body: JSON.stringify({ query: print(doc) }),
  })
    .then((res) => res.json())
    .then((json) => json.data as T);
};

function useTypedSWR<T, V>(document: TypedDocumentNode<T, V>) {
  return useSWR(print(document), () => fetcher(document));
}

export default function Index() {
  const { data, error, isLoading } = useTypedSWR(GetUsersDocument);

  if (error) return <div>Failed to load</div>;
  if (isLoading) return <div>Loading...</div>;
  if (!data) return null;

  const { users } = data;

  return (
    <div>
      {users.map((user, index) => (
        <div key={index}>{user.name}</div>
      ))}
    </div>
  );
}
