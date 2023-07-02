# Chat with notes

Create embeddings from notes and chat with them within modal

## Install plugin

Clone this repo to your obsidian plugin folder and enabled it in Obsidian settings 

## Requirements

ChromeDB for storage for embeddings (https://www.trychroma.com/) 
OpenAI API for chat feature and making embeddings (https://openai.com/)

### Create chroma local DB

1. ```git clone https://github.com/chroma-core/chroma.git```

2. add `CHROMA_SERVER_CORS_ALLOW_ORIGINS=["app://obsidian.md"]` to environment block in `docker-compose.yml` for `server` config

3. `docker-compose up -d --build`

## Using commands

| Command            | Description                               |
|--------------------|-------------------------------------------|
| Reindex embeddings | Create new embeddings                     |
| Chat with notes    | Open modal window to chat with mebeddings |

## Settings

| Setting name   | Description                  |
|----------------|------------------------------|
| OpenAI API key | API key provided from OpenAI |
| Model name     | Model for using in chat      |

