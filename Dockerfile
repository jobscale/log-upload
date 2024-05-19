FROM node:lts-bookworm-slim
SHELL ["bash", "-c"]
WORKDIR /home/node
USER node
COPY --chown=node:staff package.json .
RUN npm i --omit=dev
COPY --chown=node:staff  index.js .
CMD ["npm", "start"]
