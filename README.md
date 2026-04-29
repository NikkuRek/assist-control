# Documentación de `acc-con.express`

## Descripción General

Este proyecto es un sistema de asistencia llamado **Access Manager**, diseñado para gestionar el control de acceso y asistencia de personal, especialmente en entornos con **turnos rotativos**. Utiliza tecnologías modernas como **Express.js** para el backend, **Tailwind CSS** para el diseño visual y **JavaScript** para la lógica del frontend.

---

## Dependencias Principales

### 1. **Express.js**
- **¿Qué es?**  
  Framework minimalista para Node.js que facilita la creación de servidores web y APIs.
- **¿Cómo se usa?**  
  Permite definir rutas, manejar peticiones HTTP y gestionar middleware para autenticar, validar y procesar datos.

### 2. **Tailwind CSS**
- **¿Qué es?**  
  Framework de CSS basado en utilidades, que permite crear interfaces modernas y responsivas rápidamente.
- **¿Cómo se usa?**  
  Se incluyen clases directamente en los elementos HTML para aplicar estilos sin escribir CSS personalizado.

### 3. **JavaScript**
- **¿Qué es?**  
  Lenguaje de programación que se ejecuta en el navegador y en el servidor (Node.js).
- **¿Cómo se usa?**  
  En el frontend, gestiona la interacción del usuario y la actualización dinámica de la interfaz. En el backend, Express utiliza JavaScript para definir la lógica del servidor.

---

## Estructura del Sistema

### 1. **Frontend**
- Utiliza **Tailwind CSS** para el diseño.
- Incluye botones y navegación para acceder a reportes diarios, historial y gestión de personal.
- Usa **Font Awesome** para iconos visuales.

### 2. **Backend**
- **Express.js** define rutas para:
  - Registrar asistencia.
  - Consultar reportes diarios.
  - Acceder al historial.
  - Gestionar personal.

---

## Logística de Turnos Rotativos

### **¿Qué son los turnos rotativos?**
Son horarios de trabajo que cambian periódicamente, por ejemplo:
- Turno mañana (6:00-14:00)
- Turno tarde (14:00-22:00)
- Turno noche (22:00-6:00)

### **¿Cómo lo gestiona el sistema?**
1. **Definición de turnos:**  
   Cada empleado tiene asignado un turno, que puede cambiar según un calendario rotativo.
2. **Registro de asistencia:**  
   El sistema verifica el turno actual del empleado y registra la entrada/salida según el horario.
3. **Validación:**  
   Se valida que el registro de asistencia corresponda al turno asignado, evitando registros fuera de horario.
4. **Reportes:**  
   Los reportes diarios muestran quién asistió en cada turno, permitiendo detectar ausencias o retrasos.
5. **Historial:**  
   Se almacena el historial de turnos y asistencias para auditoría y análisis.

---

## Resumen para Desarrolladores

- **Express.js**: Define la lógica del servidor y las rutas de la API.
- **Tailwind CSS**: Permite crear interfaces limpias y responsivas.
- **JavaScript**: Gestiona la interacción y la lógica tanto en frontend como backend.
- **Turnos rotativos**: El núcleo del sistema, gestionando horarios cambiantes y validando la asistencia según el turno asignado.

---

## Recomendaciones

- Familiarízate con la estructura de rutas de Express.
- Revisa cómo se definen y gestionan los turnos en la base de datos.
- Entiende la lógica de validación de asistencia para evitar registros incorrectos.
- Usa las utilidades de Tailwind para modificar la interfaz según necesidades.

---

**Este sistema está diseñado para adaptarse a entornos laborales con horarios complejos, facilitando la gestión y el control de asistencia de manera eficiente y moderna.**