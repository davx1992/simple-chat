# simple-chat
Simple-Chat is Node.JS based Chat Server. Simple-Chat supports basic chat chat features.
[Simple-Chat server](https://github.com/davx1992/simple-chat) is package should could be used to connect to Simple-Chat server.

## Installation
1. Install [RethinkDB](https://rethinkdb.com/docs/install/) - This is NoSQL database which is used in this server.
2. Clone this repository
```bash
git clone https://github.com/davx1992/simple-chat.git
```
3. Create Database in RethinkDB. You can name your database `simple_chat`. 
> **Note:** If you are not familiar with RethinkDB please check this [Thirty second guide](https://rethinkdb.com/docs/quickstart/).
4. Open folder when Simple-Chat were cloned to and install dependencies.
```bash
npm install
```
5. Run Server
```bash
npm run dev

OR

npm run build
node dist/index
```
## Purpose
Initial idea which were implemented in this server, 
was to build lightweight simple chat message delivery system, which would be easy to maintain and easy to implement new features.
We used libraries which proved reliability, and we are sure that system will be stable.
#### This chat server *is*:
* Message delivery system
#### Thic chat server is *not*:
* **Full** chat solution - it means that Simple-Chat is not handling authentication and authorization.
Simple-Chat is relying on external API which is verifying AccessToken. Simple-Chat need external API to store users and chat related data.

## Tech Stack
Main packages and libraries used to build Simple-Chat:
* `Inversify.JS`
* `RethinkDB`
* `Socket.IO`

## Usage
As of now below properties could be configured in `src/index.js`
- **port (_number_)** -- define port of the chat server.
- **extAuthenticationUrl (_string_)** -- external API url which will verify AccessToken which is being passed from client on connection.
External API should return JSON as below. If AccessToken is verified then return 
```typescript
{ verified: boolean }
```

TODO: list all params
TODO: mention recommended user flow


## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License

[MIT](https://choosealicense.com/licenses/mit/)
