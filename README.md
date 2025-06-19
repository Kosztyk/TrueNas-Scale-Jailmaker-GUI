# Home-Assistant Custom Components
Jailmaker GUI - a web grafical interface for Truenas Scale management

This app is docker based, needs to be installed on a diffrent host than Truenas itself because needs to ssh connect to server

Fisrt page: - create an user, this is the application local user

<img width="809" alt="Screenshot 2025-02-04 at 20 35 46" src="https://github.com/user-attachments/assets/09aed706-c78a-4200-83fe-6928d2f0a7e9" />

Second Page - server credentials 

<img width="809" alt="Screenshot 2025-02-04 at 20 36 19" src="https://github.com/user-attachments/assets/fedd1c05-ceac-4901-aa4c-e0d24f4a13cb" />

3th page - introduce the paths from Truenas where jails are installed, up to 3

<img width="809" alt="Screenshot 2025-02-04 at 20 36 52" src="https://github.com/user-attachments/assets/cdd6841a-25a8-4b8e-a67f-d1766ef764ec" />

4th page - Jails management page 

<img width="1564" alt="Screenshot 2025-02-04 at 20 37 31" src="https://github.com/user-attachments/assets/d6bf730e-3d42-4e63-af33-8345ecfe1da4" />


# ** Functions **
 

   - List all Jails or sort them by paths

     <img width="1564" alt="Screenshot 2025-02-04 at 20 37 31" src="https://github.com/user-attachments/assets/c4de5995-6dea-4fcf-aecf-8eda94015cf5" />

  - Connect SSH to Truenas
    
    <img width="1360" alt="Screenshot 2025-02-04 at 20 37 56" src="https://github.com/user-attachments/assets/fb0a692d-f2e1-43ae-9c76-2a168226afc3" />

    
  - Modify Truenas details saved on Page 2 and Page 3
    
<img width="1703" alt="Screenshot 2025-02-04 at 20 38 12" src="https://github.com/user-attachments/assets/a60f157d-d25c-4420-8924-d408756f7fed" />

   - Create New Jail
     Here you can choose from diffrent options:
         -  with Docker already installed or without Docker
         - host paths binded to the jails or not;
         - choose wahat failvor you want to install
     
<img width="1703" alt="Screenshot 2025-02-04 at 20 38 34" src="https://github.com/user-attachments/assets/a7cfae1b-1876-4930-8e8e-81634ed18da9" />

   - Jails management like stop, restart, start, delete, edit (planned), connect (ssh, planned), update jail (planned)

     <img width="1341" alt="Screenshot 2025-02-04 at 21 00 12" src="https://github.com/user-attachments/assets/16dcbf3f-539d-4deb-b076-e257eea6d78b" />


   #  Installation:
       download the files on the host where docker compose is installed, execute - docker compose build then docker compose up -d

  #   Access it from http://host IP:8080

  #   Install it using docker-compose.yaml
      example of docker-compose.yaml file 
  ```
services:
  db:
    image: postgres:15
    container_name: jailmaker-db
    restart: always
    build: /root/jailmaker/db-folder
    environment:
      POSTGRES_USER: YOURUSER
      POSTGRES_PASSWORD: YOURPASSWORD
      POSTGRES_DB: jailmakerdb
    volumes:
      - db-data:/var/lib/postgresql/data
    networks:
      - jailmaker-net
    ports:
      - "5432:5432"

  jailmaker-gui:
    image: kosztyk/jailmaker-jailmaker-gui:latest
    container_name: jailmaker-gui
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      # The Node.js app reads these to connect to Postgres
      DB_HOST: db
      DB_PORT: 5432
      DB_USER: YOURUSER
      DB_PASS: YOURPASSWORD
      DB_NAME: jailmakerdb
    networks:
      - jailmaker-net

  pgadmin:
    image: dpage/pgadmin4
    container_name: pgadmin
    restart: always
    environment:
      PGADMIN_DEFAULT_EMAIL: YOUREMAIL
      PGADMIN_DEFAULT_PASSWORD: YOURPASSWORD
    ports:
      - "5050:80" # Exposes pgAdmin on port 5050
    volumes:
      - /root/jailmaker/servers.json:/pgadmin4/servers.json:ro
    networks:
      - jailmaker-net
    depends_on:
      - db

networks:
  jailmaker-net:
    driver: bridge

volumes:
  db-data:
```
