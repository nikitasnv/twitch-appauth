/*
 * Copyright 2017 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the
 * License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { EventEmitter } from 'events';
import * as Http from 'http';
import * as Url from 'url';
import * as qs from 'querystring';
import { AuthorizationRequest, AuthorizationRequestJson } from '@openid/appauth/built/authorization_request';
import { AuthorizationRequestResponse } from '@openid/appauth/built/authorization_request_handler';
import { AuthorizationServiceConfiguration } from '@openid/appauth/built/authorization_service_configuration';
import { log } from '@openid/appauth/built/logger';
import { NodeBasedHandler } from "@openid/appauth/built/node_support/node_request_handler";

// TypeScript typings for `opener` are not correct and do not export it as module
// @ts-ignore
import opener = require('opener');

class ServerEventsEmitter extends EventEmitter {
  static ON_UNABLE_TO_START = 'unable_to_start';
  static ON_API_ERROR = 'api_error';
  static ON_AUTHORIZATION_RESPONSE = 'authorization_response';
}

export class TwAuthorizationRequest extends AuthorizationRequest {
  getTokenUri: string;

  constructor(
    request: AuthorizationRequestJson & { get_token_uri: string },
    ...rest: any[]) {
    super(request, ...rest);
    this.getTokenUri = request.get_token_uri;
  }
}

export class TwAuthorizationHandler extends NodeBasedHandler {
  performAuthorizationRequest(configuration: AuthorizationServiceConfiguration,
                              request: TwAuthorizationRequest) {
    const emitter = new ServerEventsEmitter();
    const requestHandler = (httpRequest: Http.IncomingMessage, response: Http.ServerResponse) => {
      if (!httpRequest.url) {
        return;
      }
      const url = Url.parse(httpRequest.url);
      const redirectUrl = Url.parse(request.redirectUri);
      const getTokenUrl = Url.parse(request.getTokenUri);
      const searchParams = new Url.URLSearchParams(url.query || '');

      const error = searchParams.get('error');
      if (error) {
        log('error', error);
        const error_description = searchParams.get('error_description');
        response.statusCode = 500;
        response.end(error_description ? error_description : error);
        emitter.emit(ServerEventsEmitter.ON_API_ERROR, {error, error_description});
        return;
      }

      if (url.pathname === getTokenUrl.pathname && httpRequest.method === 'POST') {
        log('Handling POST Authorization Request ');
        let body = '';
        httpRequest.on('data', function(data) {
          body += data.toString();
        }).on('end', function() {
          const dataObject = qs.parse(body);
          response.end();
          emitter.emit(ServerEventsEmitter.ON_AUTHORIZATION_RESPONSE, { request, response: dataObject });
        });
        return;
      }

      if (url.pathname === redirectUrl.pathname && httpRequest.method === 'GET') {
        log('Handling GET Authorization Request ');
        response.end(`
<script>
  var xhr = new XMLHttpRequest();
  xhr.open("POST", "${getTokenUrl.href}");
  xhr.send(String.prototype.slice.call(window.location.hash, 1));
  xhr.onload = function() {
  document.body.append("Close window.")
  };
</script>`);
      }
    };

    this.authorizationPromise = new Promise<AuthorizationRequestResponse>((resolve, reject) => {
      emitter.once(ServerEventsEmitter.ON_UNABLE_TO_START, () => {
        reject(`Unable to create HTTP server at port ${this.httpServerPort}`);
      });
      emitter.once(ServerEventsEmitter.ON_API_ERROR, (error: any) => {
        if (server.listening) {
          server.close();
        }
        reject(`API Error ${error.toString()}`);
      });
      emitter.once(ServerEventsEmitter.ON_AUTHORIZATION_RESPONSE, (result: any) => {
        server.close();
        // resolve pending promise
        resolve(result as AuthorizationRequestResponse);
        // complete authorization flow
        this.completeAuthorizationRequestIfPossible();
      });
    });
    this.authorizationPromise.catch(err => console.error(err));

    let server: Http.Server;
    request.setupCodeVerifier()
      .then(() => {
        server = Http.createServer(requestHandler);
        server.listen(this.httpServerPort);
        const url = this.buildRequestUrl(configuration, request);
        log('Making a request to ', request, url);
        opener(url);
      })
      .catch((error) => {
        log('Something bad happened ', error);
        emitter.emit(ServerEventsEmitter.ON_UNABLE_TO_START);
      });
  }
}
