# Step 1: Use an official Node.js image as the base image
FROM node:20-slim

# Step 2: Set the working directory in the container
WORKDIR /usr/src/app

# Step 3: Copy package.json and package-lock.json
COPY package*.json ./

# Step 4: Install dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
	ca-certificates \
	curl \
	netcat-openbsd \
	&& rm -rf /var/lib/apt/lists/*

# Install node modules at build time (cacheable)
RUN npm install

# Step 5: Copy the rest of the application files
COPY . .

# Step 6: Expose the port that the app will run on
EXPOSE 5050

# Step 7: Define the command to run the application
RUN chmod +x scripts/wait-for-kafka.sh || true
CMD ["node", "server.js"]
