-- MySQL dump 10.13  Distrib 5.7.43, for Win64 (x86_64)
--
-- Muestra FICTICIA para tests del módulo RRHH. No contiene datos reales.
-- Mismo formato que el backup de Salario (mysqldump, extended-insert).
--

DROP TABLE IF EXISTS `acceso`;
CREATE TABLE `acceso` (
  `CODIGO` varchar(50) NOT NULL DEFAULT ' ',
  `PROCESO` varchar(80) NOT NULL DEFAULT ' '
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
INSERT INTO `acceso` VALUES ('X1','no se lee'),('X2','tampoco');

DROP TABLE IF EXISTS `empleado`;
CREATE TABLE `empleado` (
  `LEGAJO` int(11) NOT NULL DEFAULT '0',
  `NOMBRE` varchar(60) NOT NULL DEFAULT ' ',
  `CCOSTO` int(11) NOT NULL DEFAULT '0',
  `SECCION` int(11) NOT NULL DEFAULT '0',
  `PUESTO` int(11) NOT NULL DEFAULT '0',
  `ESQLIQ` int(11) NOT NULL DEFAULT '0',
  `FECING` date DEFAULT NULL,
  `FECING2` date DEFAULT NULL,
  `FECEGR` date DEFAULT NULL,
  PRIMARY KEY (`LEGAJO`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
INSERT INTO `empleado` VALUES (1,'PERSONA UNO',17,8,3,6,'2015-03-01','0000-00-00','0000-00-00'),(2,'PERSONA O\'DOS, \"PRUEBA\"',17,8,3,6,'2022-01-10',NULL,NULL),(3,'PERSONA TRES',16,6,7,5,'2010-05-01','2012-02-01','2026-09-30');

DROP TABLE IF EXISTS `liq2023`;
CREATE TABLE `liq2023` (
  `LEGAJO` int(11) NOT NULL DEFAULT '0',
  `MES` char(6) NOT NULL DEFAULT ' ',
  `TIPOLIQ` char(1) NOT NULL DEFAULT ' ',
  `CONCEPTO` char(6) NOT NULL DEFAULT ' ',
  `CANT` decimal(15,2) NOT NULL DEFAULT '0.00',
  `MONTO` decimal(15,2) NOT NULL DEFAULT '0.00',
  `CCOSTO` int(11) NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
INSERT INTO `liq2023` VALUES (1,'202312','3','HEX050',99.00,99999.00,17);

DROP TABLE IF EXISTS `liq2026`;
CREATE TABLE `liq2026` (
  `LEGAJO` int(11) NOT NULL DEFAULT '0',
  `MES` char(6) NOT NULL DEFAULT ' ',
  `TIPOLIQ` char(1) NOT NULL DEFAULT ' ',
  `CONCEPTO` char(6) NOT NULL DEFAULT ' ',
  `DESCR` varchar(50) NOT NULL DEFAULT ' ',
  `CANT` decimal(15,2) NOT NULL DEFAULT '0.00',
  `MONTO` decimal(15,2) NOT NULL DEFAULT '0.00',
  `CCOSTO` int(11) NOT NULL DEFAULT '0',
  KEY `LIQ2026_IDX` (`LEGAJO`,`MES`,`TIPOLIQ`,`CONCEPTO`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
INSERT INTO `liq2026` VALUES (1,'202608','3','HEX050','Horas Extras 50%',10.00,15000.00,17),(1,'202608','3','HEX100','Horas Extras 100%',4.00,8000.00,17),(1,'202608','3','HSVIG1','Horas feriado',8.00,12000.00,17),(1,'202608','3','FERIAD','Art. 169 Lct - Dias Feriados',1.00,500.00,17),(1,'202608','3','(TREM)','Total Remunerativo',0.00,1000000.00,17),(1,'202608','3','DSENFE','INT-Dias de Enfermedad',0.00,2.00,17),(1,'202608','9','HEX050','Liquidación informativa',99.00,99999.00,17);
INSERT INTO `liq2026` VALUES (2,'202608','3','SUELDO','Sueldo Básico',30.00,800000.00,12),(2,'202608','3','DSVAME','INT-Dias Vacaciones en Mes',0.00,14.00,17),(2,'202608','3','FERIAD','Art. 169 Lct - Dias Feriados',1.00,400.00,17),(2,'202608','3','(TREM)','Total Remunerativo',0.00,900000.00,17),(3,'202608','3','HEX100','Horas Extras 100%',50.00,100000.00,16),(3,'202608','3','AHE100','Ajuste Horas Extras 100%',5000.00,5000.00,16),(3,'202608','3','HSNOCT','Horas Nocturnas',20.00,9000.00,16),(3,'202608','3','(TREM)','Total Remunerativo',0.00,1500000.00,16);
INSERT INTO `liq2026` VALUES (1,'202609','3','HEX050','Horas Extras 50%',6.00,9000.00,17),(1,'202609','3','HEX050','Horas Extras 50%',2.00,3000.00,17),(1,'202609','3','(TREM)','Total Remunerativo',0.00,1000000.00,17),(3,'202609','3','HEX100','Horas Extras 100%',450.00,900000.00,16);

DROP TABLE IF EXISTS `tablas`;
CREATE TABLE `tablas` (
  `COTAB` int(11) NOT NULL DEFAULT '0',
  `CODIGO` decimal(20,0) NOT NULL DEFAULT '0',
  `DESCR` varchar(80) NOT NULL DEFAULT ' '
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
INSERT INTO `tablas` VALUES (2,0,'Centros de Costo'),(2,16,'PROTECCION DE VALORES'),(2,17,'SERVICIO DE SEGURIDAD PRIVADA'),(5,8,'Seguridad Privada'),(17,6,'Suvico'),(22,3,'Seguridad Privada'),(30,3,'Enfermedad');

DROP TABLE IF EXISTS `vac`;
CREATE TABLE `vac` (
  `LEGAJO` int(11) NOT NULL DEFAULT '0',
  `DIAS` int(11) NOT NULL DEFAULT '0',
  `FECINI` date DEFAULT NULL,
  `FECFIN` date DEFAULT NULL,
  `AA` int(11) NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
INSERT INTO `vac` VALUES (2,14,'2026-08-03','2026-08-16',2025),(1,21,'2024-01-02','2024-01-22',2023),(1,14,'2026-11-02','2026-11-15',2026);
-- Dump completed on 2026-10-05 20:30:01
