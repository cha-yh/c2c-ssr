import Koa from 'koa';
import serve from 'koa-static';

import path from 'path';
import React from 'react';
import { StaticRouter } from 'react-router-dom';
import { ChunkExtractor } from '@loadable/server';
import { Helmet } from 'react-helmet';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import { renderToString } from 'react-dom/server';

import reducers from './store/reducers';
import { ApolloProvider, ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';

const fetch = require('node-fetch');

// const app = express();
const app = new Koa();

if (process.env.NODE_ENV !== 'production') {
  /* eslint-disable global-require, import/no-extraneous-dependencies */
  /* eslint-disable no-param-reassign */
  const webpack = require('webpack');
  const webpackConfig = require('../webpack.client.js').map((config: any) => {
    config.output.path = config.output.path.replace('dist/dist/', 'dist/');
    return config;
  });

  const webpackDevMiddleware = require('koa-webpack-dev-middleware');
  const webpackHotMiddleware = require('koa-webpack-hot-middleware');
  /* eslint-enable global-require, import/no-extraneous-dependencies */
  /* eslint-enable no-param-reassign */

  const compiler = webpack(webpackConfig);

  app.use(
    webpackDevMiddleware(compiler, {
      logLevel: 'silent',
      publicPath: webpackConfig[0].output.publicPath,
      writeToDisk: true,
    }),
  );

  app.use(webpackHotMiddleware(compiler));
}

app.use(
  serve(path.resolve(__dirname), {
    index: false,
  }),
);

app.use((ctx, next) => {
  const nodeStats = path.resolve(__dirname, './node/loadable-stats.json');
  const webStats = path.resolve(__dirname, './web/loadable-stats.json');
  const nodeExtractor = new ChunkExtractor({ statsFile: nodeStats });
  const { default: App } = nodeExtractor.requireEntrypoint();
  const webExtractor = new ChunkExtractor({ statsFile: webStats });

  const store = createStore(reducers);
  const context = {};
  const client = new ApolloClient({
    ssrMode: true,
    cache: new InMemoryCache(),
    link: new HttpLink({
      uri: 'https://api.spacex.land/graphql',
      fetch
    })
  });

  const jsx = webExtractor.collectChunks(
    <ApolloProvider client={client}>
      <Provider store={store}>
        <StaticRouter location={ctx.url} context={context}>
          <App />
        </StaticRouter>
      </Provider>
    </ApolloProvider>,
  );

  const html = renderToString(jsx);
  const helmet = Helmet.renderStatic();
  if (!html) {
    return next();
  }

  ctx.set('content-type', 'text/html');
  ctx.body = `
    <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta name="viewport" content="width=device-width, user-scalable=no">
          <meta name="google" content="notranslate">
          ${helmet.title.toString()}
          ${webExtractor.getLinkTags()}
          ${webExtractor.getStyleTags()}
        </head>
        <body>
          <div id="root">${html}</div>
          ${webExtractor.getScriptTags()}
        </body>
      </html>
  `;
});

app.listen(3003, () => console.log('Server started http://localhost:3003'));
