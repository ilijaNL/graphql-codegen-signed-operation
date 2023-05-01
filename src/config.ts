export interface GraphQLSignedOperationPluginOptions {
  /**
   * A secret which is used to sign the graphql operations.
   * This secret should not be exposed in the client and only be available during build time.
   * The same secret needs to be used on the server to validate the request.
   */
  secret: string;
  /**
   * Algorithm used for creating the signed hash.
   * @Default sha256
   */
  algorithm?: string;
}
