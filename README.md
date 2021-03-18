# simple-chat

Simple-Chat is Node.JS based Chat Server. Simple-Chat supports basic chat features.
[Simple-Chat-Client](https://github.com/davx1992/simple-chat-client) is package should could be used to connect to Simple-Chat server.

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

#### This chat server _is_:

- Message delivery system

#### This chat server is _not_:

- **Full** chat solution - it means that Simple-Chat is not handling authentication and authorization.
  Simple-Chat is relying on external API which is verifying AccessToken. Simple-Chat need external API to store users and chat related data.

**Simple-Chat** focus is to ensure that message is delivered, so user who had to receive message, receives it. This is achieved by ack callbacks.
When message received user must to acknowledge the message, otherwise, message will be moved to offline message queue, and will be pushed on user reconnection.
If user do not acknowlege message, however he is online, system captures timeout and also moves message to offline message queue.

When this package were built we inspired from Ejabberd chat server, which is proved it's reliability, but it was heavy, and was hard to maintain and extend,
as it is written in Erlang, which is not the most popular language. As well as we wanted to get simple chat server, which will cover basic needs, which actaully Simple-Chat is covering.

## Tech Stack

Main packages and libraries used to build Simple-Chat:

- `Inversify.JS`
- `RethinkDB`
- `Socket.IO`

## Usage

As of now below properties could be configured in `src/index.js`

- **port (_number_)** -- define port of the chat server.
- **extAuthenticationUrl (_string_)** -- external API url which will verify AccessToken which is being passed from client on connection.
  External API should return JSON as below. If AccessToken is verified then return

```typescript
{
  verified: boolean;
}
```

- **offlineMessageUrl (_string_)\***(optional) -- external API endpoint url which will handle offline message. When receipient is not online or has not acknowledged message when received, it is being moved to offline message queue. Simple-Chat will do POST call to provided endpoint with message in the body.

```typescript
{ message: Message }

Message {
  id?: string;
  to: string;
  timestamp: number,
  body?: {
    [key: string]: unknown;
  };
  from?: string;
}
```

If url is not provided, no call will be made, but message will be moved to offline message queue, and `will be resent on user reconnection`.

- **host (_string_)** -- host of the RethinkDB instance.
- **db*port (\_number*)** -- port of the RethinkDB instance.
- **db*name (\_string*)** -- database name of the RethinkDB instance.

## Recommended use case

#### Recommended flow of actions to participate in chat to use in your frontend app is:

1. When user open multi user chat(@MUC), join chat temporary.
   > **Note:** if user do not join chat, he will not get any messages. To get messages user needs to join chat temporary or permanently.
2. When user joined chat temporary, he will be getting messages from other users, until he do not leave the chat.
   > **Note:** all temporary chat joins will be cleared when user disconnects.
3. If user sends message in chat, where he was temporary user, then he automatically is made permanent user, and will receive offline messages.
   In this case there is no need to leave chat and no need join again.

![chat_user_state_flow](https://user-images.githubusercontent.com/2311893/109122516-6544dc00-7751-11eb-91c2-16a245932cef.png)

## API reference

Simple-Chat exposes basic actions in API. API is **not having** any authentication, hence should be used only in local network, and should not be exposed to public network.
We recommend to use such setup:
![system_landscape](https://user-images.githubusercontent.com/2311893/109118405-f31dc880-774b-11eb-8e0b-34af64294d68.png)

### Below are the avalaible API enpoints:

---

### Create Chat

- **userId (_string_)** -- user id which is creating chat.
- **type (_ChatTypes_)** -- type of the chat.
- **users (_string[]_)**(optional) -- user array who will be chat users. Is used _only for @SUC_ chat, as @SUC chat is having only two users.

```typescript
POST /api/chat/create
 {
  userId: string;
  type: ChatTypes;
  users?: string[];
 }

ChatTypes {
  SUC = '@suc',
  MUC = '@muc',
}
```

#### Result

Chat Id: string, Status Code (200 on success, 500 on failure).

---

### Join Chat

- **chatId (_string_)** -- id of the chat to which join user.
- **userId (_ChatTypes_)** -- id of the user which joining the chat.
- **temp (_boolean_)**-- flag if user joining chat temporary or permanently. If temp is true then on user disconnection join will be removed,
  and next time when user will open chat, he needs to join chat again.

```typescript
POST / api / chat / join;
{
  chatId: string;
  userId: string;
  temp: boolean;
}
```

#### Result

Status Code (200 on success, 500 on failure).

---

### Leave Chat

- **chatId (_string_)** -- id of the chat to leave.
- **userId (_string_)** -- id of the user which leaving the chat.

```typescript
POST / api / chat / join;
{
  chatId: string;
  userId: string;
}
```

#### Result

Status Code (200 on success, 500 on failure).

---

### Load inactive chats

Used to load chats which had no messages for provided period and considered as inactive.

- **old (_number_)** -- how long time chat had no messages.
- **entity (_string_)** -- time entity how to measure old chats. Avaliable values - days, hours, minutes, seconds, weeks, months.
- **type (_ChatTypes_)** -- what type of chat to search - @muc or @suc.

Example if it is needed to load chats which had no messages for more than one day:

```typescript
GET /api/chat/inactive?old=1&entity=days&type@muc
```

#### Result

Chat Id's array: string[], Status Code (200 on success, 500 on failure).

---

### Delete chats

Delete list of chats. All chat related entities will be deleted, messages, chats, chat users, offline messages.

- **chatIds (_string[]_)** -- list of chat id's to delete.

```typescript
POST /api/chat/delete
 {
  chatIds: string[]
 }
```

#### Result

Status Code (200 on success, 500 on failure).

---

### Block chat

Block chat entity. If chat is blocked then no messages will be delivered and sender will receive error with code 4003. If both users blocked chat, then chat will stay blocked until both users unbblock it.

- **chatId (_string_)** -- chat id which to block.
- **userId (_string_)** -- id of the user which leaving the chat.
- **block (_boolean_)** -- action to block or unblock.

```typescript
POST /api/chat/block
 {
  chatId: string,
  userId: string,
  block: boolean
 }
```

#### Result

Status Code (200 on success, 500 on failure).

## To consider

This is fresh package, and there could be design gaps, and issues. Please report them under Issues, so we can fix them and improve our chat server.
Queries used in RethinkDB were optimized and using Indexes, which improves performance significantly.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License

[MIT](https://choosealicense.com/licenses/mit/)
