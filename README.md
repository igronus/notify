# Delayed Notification System

## Task Overview

Implement a simple system that allows users to schedule notifications to be sent at a
specified time in the future.

The system should consist of two main components:

### 1. Server

The server is responsible for scheduling, storing, and dispatching notifications. It should
expose an HTTP API with at least the following endpoints:
* POST /notifications\
Create a new delayed notification that will be sent in the future.
* GET /notifications/{id}\
Retrieve metadata for a specific notification, including its current status (pending,
sent, or failed).

The server must:
* Accept notifications with a target timestamp.
* Persist notifications in a database.
* Process and send notifications at or after the scheduled time.
* Ensure that no notification is sent more than once.

### 2. Client

The client connects to the server to receive and display its own messages in real-time or
near-real-time. It can be a simple CLI tool - no need for a graphical interface.
Each client should be identifiable via a unique client_id, allowing the server to route
messages only to the intended recipient.

General Requirements
* Use any programming language, database, and queue management mechanism of
your choice.
* Provide a working codebase for both server and client.
* Include a README or deployment guide.
* Ideally, the project should be runnable locally using Docker and/or Docker Compose.

## Solution

### TL;DR

The shortest way to get the past notifications and subscribe to the new ones:

```
docker compose up -d
docker exec notify-app node populate -n 10000
docker exec notify-app node client client_0
# on another terminal you will get notifications up to client_6 by default
docker exec notify-app node client client_<N>
```

### Tech stack

Implemented with mongodb8 and node22. Notification dispatching is done via WebSockets, strategy is At-Least-Once.

### Running

Use `docker compose up` to start the containers.

### DB populating

The following command will populate the DB with the default values (1M records).

```
docker exec notify-app node populate
```

You can use the following options to tune up the notification populating:

| Name                           | Option        | Short option | Default value  |
|--------------------------------|---------------|--------------|----------------|
| Quantity                       | --number=<N>  | -n <N>       | 1,000,000      |
| Batch size                     | --batch=<N>   | -b <N>       | 10,000         |
| Clients number                 | --clients=<N> | -c <N>       | 7              |
| Start time (seconds, from now) | --start=<N>   | -s <N>       | -300 (-5 min)  |
| End time (seconds, from now)   | --end=<N>     | -e <N>       | 1,800 (30 min) |

I.e. something like that to fill up 1B records for 1024 clients from -day to +week:

```
docker exec notify-app node populate -n 1000000000 -c 1024 --start=-86400 --end=604800
```

### Usage

Creating a notification:

```
curl -X POST -H "Content-Type: application/json" -d '{"clientId": "client999", "time": 1750000000000, "text": "test"}' http://127.0.0.1:3000/notifications
```

Getting a notification:

```
curl http://127.0.0.1:3000/notifications/<ID>
```

Client connection:

```
docker exec notify-app node client <CLIENT_ID>
```

Client IDs are `client_0`, `client_1`, ... `client_6` by default if you have used the populate feature.

### Statistics collection

```js
db.notifications.aggregate([
  {
    // Stage 1: Group documents by 'clientId'
    $group: {
      _id: "$clientId", // Group by the 'clientId' field
      totalNotifications: { $sum: 1 }, // Total count for this client
      pendingNotifications: {
        $sum: {
          $cond: [
            { $eq: ["$status", "PENDING"] }, // If status is "PENDING"
            1,                               // add 1 to pendingNotifications
            0                                // otherwise add 0
          ]
        }
      },
      sentNotifications: {
        $sum: {
          $cond: [
            { $eq: ["$status", "SENT"] }, // If status is "SENT"
            1,                             // add 1 to sentNotifications
            0                              // otherwise add 0
          ]
        }
      }
    }
  },
  {
    // Stage 2: Sort the results by 'totalNotifications' in descending order
    $sort: {
      totalNotifications: -1 // -1 for descending, 1 for ascending
    }
  },
  {
    // Stage 3 (Optional): Limit the results if you only want the top N clients
    $limit: 10 // Get the top 10 clients by total notification count
  },
  {
    // Stage 4 (Optional): Project (rename) the _id field to something more readable
    $project: {
      _id: 0, // Exclude the default _id field from the output
      clientId: "$_id", // Rename the grouped _id field to 'clientId'
      totalNotifications: 1, // Include the totalNotifications field
      pendingNotifications: 1, // Include the pendingNotifications field
      sentNotifications: 1 // Include the sentNotifications field
    }
  }
]);
```

The output would be something similiar to this:

```
{
  totalNotifications: 168597,
  pendingNotifications: 162998,
  sentNotifications: 5599,
  clientId: 'client_0'
}
{
  totalNotifications: 167972,
  pendingNotifications: 167794,
  sentNotifications: 178,
  clientId: 'client_1'
}
...
```

#### TODO

There are a lot of things to improve the app within this implementation, amongst them starting from the most important:

* Predict the snowball effect and alert on that, i.e. if the new notifications are created faster than they could be
delivered (or were created before and will take a lot of time to dispatch)
* Ability to tune up the batch size for server, setting up the checkAndSendPendingNotifications interval
* Client: reconnect on lost connection, unhardcode WS URL
* Refactor the init code to use the existing connection
