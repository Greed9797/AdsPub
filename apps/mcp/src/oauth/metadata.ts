import type { McpConfig } from '../config.js';
import { ALL_SCOPES } from './scopes.js';

/**
 * Os dois documentos de descoberta: o do recurso (RFC 9728, apontado pelo
 * desafio `WWW-Authenticate`) e o do authorization server (RFC 8414).
 * Ambos são públicos e servidos no mesmo host do app.
 */
export function protectedResourceMetadata(config: McpConfig): Record<string, unknown> {
  return {
    resource: config.publicUrl.href,
    authorization_servers: [config.issuer],
    scopes_supported: [...ALL_SCOPES],
    bearer_methods_supported: ['header'],
    resource_name: 'AdPub',
    resource_documentation: `${config.issuer}/`,
  };
}

export function authorizationServerMetadata(config: McpConfig): Record<string, unknown> {
  return {
    issuer: config.issuer,
    authorization_endpoint: `${config.issuer}/authorize`,
    token_endpoint: `${config.issuer}/token`,
    registration_endpoint: `${config.issuer}/register`,
    revocation_endpoint: `${config.issuer}/revoke`,
    scopes_supported: [...ALL_SCOPES],
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    authorization_response_iss_parameter_supported: true,
  };
}
