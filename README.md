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

Implemented with mongodb8 and node22.

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
