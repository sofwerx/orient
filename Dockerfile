FROM node

COPY package.json /app/package.json

WORKDIR /app

RUN npm install

COPY . /app

EXPOSE 9999

ADD run.sh /run.sh

RUN apt-get update && apt-get install -y vim-tiny

CMD /run.sh
