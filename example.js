const { AuthorizationNotifier } = require('@openid/appauth/built/authorization_request_handler');
const { AuthorizationServiceConfiguration } = require('@openid/appauth/built/authorization_service_configuration');
const { TwAuthorizationRequest, TwAuthorizationHandler } = require('./node_request_handler');
const options = require('./options');

const notifier = new AuthorizationNotifier();
const authorizationHandler = new TwAuthorizationHandler();

authorizationHandler.setAuthorizationNotifier(notifier);
notifier.setAuthorizationListener((request, response, error) => {
  console.log('Authorization request complete ', request, response, error);
});

authorizationHandler.performAuthorizationRequest(
  new AuthorizationServiceConfiguration({
    'authorization_endpoint': 'https://id.twitch.tv/oauth2/authorize',
    'token_endpoint': 'https://id.twitch.tv/oauth2/token',
    'revocation_endpoint': 'https://id.twitch.tv/oauth2/revoke'
  }),
  new TwAuthorizationRequest({
    client_id: options.client_id, //your client_id from app
    redirect_uri: 'http://localhost:8000/auth_token', //same as OAuth Redirect URL in app
    get_token_uri: 'http://localhost:8000/get_token', //pathname can be any
    scope: 'viewing_activity_read chat:read chat:edit',
    response_type: 'token' // token | code
  })
);
