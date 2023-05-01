import {
  DocumentNode,
  ExecutableDefinitionNode,
  FragmentDefinitionNode,
  Kind,
  OperationDefinitionNode,
  parse,
  print,
  visit,
} from 'graphql';
import { PluginFunction, PluginValidateFn, Types } from '@graphql-codegen/plugin-helpers';
import { GraphQLSignedOperationPluginOptions } from './config';
// this will print all documents in stable way
import { printExecutableGraphQLDocument } from '@graphql-tools/documents';
import { extname } from 'path';
import { createHmac } from 'node:crypto';

/**
 * Returns an array of fragments required for a given operation, recursively.
 * Will throw an error if it cannot find one of the fragments required for the operation.
 * @param operationDefinition the operation we want to find fragements for.
 * @param fragmentDefinitions a list of fragments from the same document, some of which may be required by the operation.
 * @param documentLocation location of the document the operation is sourced from. Only used to improve error messages.
 * @returns an array of fragments required for the operation.
 */
function getOperationFragmentsRecursively(
  operationDefinition: OperationDefinitionNode,
  fragmentDefinitions: FragmentDefinitionNode[],
  documentLocation: string
): FragmentDefinitionNode[] {
  const requiredFragmentNames = new Set<string>();

  getRequiredFragments(operationDefinition);

  // note: we first get a list of required fragments names, then filter the original list.
  // this means order of fragments is preserved.
  return fragmentDefinitions.filter((definition) => requiredFragmentNames.has(definition.name.value));

  /**
   * Given a definition adds required fragments to requieredFragmentsNames, recursively.
   * @param definition either an operation definition or a fragment definition.
   */
  function getRequiredFragments(definition: ExecutableDefinitionNode) {
    visit(definition, {
      FragmentSpread(fragmentSpreadNode) {
        // added this check to prevent infinite recursion on recursive fragment definition (which itself isn't legal graphql)
        // it seems graphql crashes anyways if a recursive fragment is defined, so maybe remove this check?
        if (!requiredFragmentNames.has(fragmentSpreadNode.name.value)) {
          requiredFragmentNames.add(fragmentSpreadNode.name.value);

          const fragmentDefinition = fragmentDefinitions.find(
            (definition) => definition.name.value === fragmentSpreadNode.name.value
          );

          if (!fragmentDefinition) {
            throw new Error(
              `Missing fragment ${fragmentSpreadNode.name.value} for ${
                definition.kind === Kind.FRAGMENT_DEFINITION ? 'fragment' : 'operation'
              } ${definition.name!.value} in file ${documentLocation}`
            );
          } else {
            getRequiredFragments(fragmentDefinition);
          }
        }
        return fragmentSpreadNode;
      },
    });
  }
}

function createStableSignedHash(document: DocumentNode, secret: string, algo = 'sha256') {
  // this will print it in a stable way
  const printedDoc = printExecutableGraphQLDocument(document);
  // hash with hmac
  return createHmac(algo, secret).update(printedDoc).digest('hex');
}

export const plugin: PluginFunction<GraphQLSignedOperationPluginOptions, Types.ComplexPluginOutput> = async (
  _schema,
  documents: Types.DocumentFile[],
  config
) => {
  //
  const mOperationMap: Record<string, string> = {};

  const allFragments = documents.reduce((agg, document) => {
    const documentFragments = document.document!.definitions.filter(
      (definition): definition is FragmentDefinitionNode =>
        definition.kind === Kind.FRAGMENT_DEFINITION && !!definition.name
    );

    agg.push(...documentFragments);

    return agg;
  }, [] as FragmentDefinitionNode[]);

  // filter out anonymous fragments

  for (const document of documents) {
    // filter out anonymous operations
    const documentOperations = document.document!.definitions.filter(
      (definition): definition is OperationDefinitionNode => definition.kind === Kind.OPERATION_DEFINITION
    );

    // for each operation in the document
    for (const operation of documentOperations) {
      const operationName = operation.name?.value;

      if (!operationName) {
        throw new Error(
          `operation ${print(
            operation
          )} does not have an operationName. graphql-codegen-signed-operation requires all operations to have operationName`
        );
      }
      // get fragments required by the operations
      const requiredFragmentDefinitions = getOperationFragmentsRecursively(operation, allFragments, document.location!);

      if (mOperationMap[operationName]) {
        throw new Error(operationName + 'is defined multiple times, please ensure all operation names are unique');
      }

      const doc = parse([...requiredFragmentDefinitions, operation].map(print).join('\n'));

      const signedDoc = createStableSignedHash(doc, config.secret, config.algorithm);

      mOperationMap[operationName] = signedDoc;
    }
  }

  return {
    content: `${JSON.stringify(mOperationMap, null, 2)}`,
  };
};

export const validate: PluginValidateFn<GraphQLSignedOperationPluginOptions> = async (
  _schema,
  _documents,
  config,
  outputFile: string
) => {
  if (extname(outputFile) !== '.json') {
    throw new Error(`Plugin "graphql-codegen-signed-operation" requires extension to be ".json"!`);
  }

  if (!config.secret) {
    throw new Error(`Plugin "graphql-codegen-signed-operation" requires config.secret to be set`);
  }
};
