Jailmaker GUI - a web grafical interface for Truenas Scale management

This app is docker based, needs to be installed on a diffrent host than Truenas itself because needs to ssh connect to server

Fisrt page: - create an user, this is the application local user

<img width="809" alt="Screenshot 2025-02-04 at 20 35 46" src="https://github.com/user-attachments/assets/09aed706-c78a-4200-83fe-6928d2f0a7e9" />

Second Page - server credentials 

<img width="809" alt="Screenshot 2025-02-04 at 20 36 19" src="https://github.com/user-attachments/assets/fedd1c05-ceac-4901-aa4c-e0d24f4a13cb" />

3th page - introduce the paths from Truenas where jails are installed, up to 3

<img width="809" alt="Screenshot 2025-02-04 at 20 36 52" src="https://github.com/user-attachments/assets/cdd6841a-25a8-4b8e-a67f-d1766ef764ec" />

4th page - Jails management page 

<img width="1703" alt="Screenshot 2025-02-04 at 20 37 31" src="https://github.com/user-attachments/assets/bfa3983f-3977-40a6-8b84-df45fae00c2f" />

 ** Functions **
 

   - List all Jails or sort them by path
     
<img width="1703" alt="Screenshot 2025-02-04 at 20 37 31" src="https://github.com/user-attachments/assets/2d743654-56b6-413d-8b7b-b24645ad78f8" />

  - Connect SSH to Truenas
    
    <img width="1703" alt="Screenshot 2025-02-04 at 20 37 56" src="https://github.com/user-attachments/assets/f578e13a-a52c-4bb6-b693-b083b5dd51dc" />
    
  - Modify Truenas details saved on Page 2 and Page 3
    
<img width="1703" alt="Screenshot 2025-02-04 at 20 38 12" src="https://github.com/user-attachments/assets/a60f157d-d25c-4420-8924-d408756f7fed" />

   - Create New Jail
     Here you can choose from diffrent options:
         -  with Docker already installed (done) or without Docker (in developement)
         - host paths binded to the jails or not;
         - choose wahat failvor you want to install
     
<img width="1703" alt="Screenshot 2025-02-04 at 20 38 34" src="https://github.com/user-attachments/assets/a7cfae1b-1876-4930-8e8e-81634ed18da9" />

   - Jails management like stop, restart, start, delete, edit (planned), connect (ssh, planned), update jail (planned)
     
     <img width="1341" alt="Screenshot 2025-02-04 at 21 00 12" src="https://github.com/user-attachments/assets/3cd431fa-3ecf-484a-81a1-331f80ef7d4f" />

     Installation:
       download the files on the host where docker compose is installed, execute - docker compose build then docker compose up -d

     Access it from http://host IP:8080
