---
title: "Operación"
description: "Poner en marcha Nexus Edge: requisitos, el primer arranque, los ajustes, el hardware, las copias y las actualizaciones."
order: 8
---

## Requisitos

- Una máquina Linux - para un sitio basta un ordenador de la clase Raspberry Pi;
- Docker con Compose v2 - todo se construye y funciona en contenedores.

## El primer arranque

```
cp .env.example .env
make up-all
```

Así arranca la plataforma (PostgreSQL con TimescaleDB, Redis, RabbitMQ, el
orquestador, la API, la pasarela de mensajes, la UI) con el núcleo de EdgeX y
el device-service. Entre como `admin` con `ADMIN_DEFAULT_PASSWORD` de `.env` y
cámbiela enseguida si la máquina es accesible desde fuera.

## Ajustes

Todos los ajustes están en `.env` (vea `.env.example`: cada valor está
comentado): los puertos, las contraseñas, la zona horaria del host (`TZ`), los
límites (tamaños de subida, los idiomas de la interfaz), la clave de cifrado
de la IA, los comandos del host. Nada está fijado en el código.

## Hardware

Los nodos del bus CAN necesitan el adaptador CAN del host conectado al
device-service; los nodos de red usan el broker MQTT. Mientras un nodo no esté
cableado, ejecútelo simulado: Nodos -> su fila -> simulado.

## Copias y actualizaciones

- Servicio -> Base de datos -> **Instantáneas del sistema**: guarde la
  configuración (dispositivos, nodos, procesos, usuarios, grupos) como un
  estado, descárguelo, aplíquelo o súbalo de nuevo, con una comprobación de
  compatibilidad previa.
- Registros: descárguelos o bórrelos hasta una fecha.
- Una actualización: obtenga la versión nueva y vuelva a `make up-all`: las
  migraciones se ejecutan al arrancar la API; los datos se conservan.
