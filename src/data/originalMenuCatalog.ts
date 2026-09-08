import { CategoryId } from '../types';
import type { ManagedMenuExtra, ManagedMenuSize } from '../lib/menuCatalogService';

export interface OriginalMenuSeedItem {
  id: string;
  name: string;
  category: CategoryId;
  description: string;
  price: number | null;
  sourcePriceText?: string;
  sizes?: ManagedMenuSize[];
  options?: string[];
  extras?: ManagedMenuExtra[];
  includedItems?: string[];
  imageUrls: string[];
  primaryImageUrl?: string;
  popular: boolean;
  active: boolean;
  available: boolean;
  sortOrder: number;
  weekendOnly?: 'Sábados' | 'Domingos';
  source: 'menu-original';
  notes?: string;
}

const base = (
  id: string,
  name: string,
  category: CategoryId,
  price: number | null,
  description: string,
  sortOrder: number,
  rest: Partial<OriginalMenuSeedItem> = {}
): OriginalMenuSeedItem => ({
  id,
  name,
  category,
  description,
  price,
  imageUrls: [],
  popular: false,
  active: true,
  available: true,
  sortOrder,
  source: 'menu-original',
  ...rest,
});

export const ORIGINAL_MENU_CATALOG: OriginalMenuSeedItem[] = [
  base('espresso', 'Espresso', 'bebidas', 25, 'Café espresso.', 10, {
    sizes: [
      { name: 'Sencillo', price: 25 },
      { name: 'Doble', price: 50 },
      { name: 'Sencillo cortado', price: 28 },
    ],
  }),
  base('americano', 'Americano', 'bebidas', null, 'Café americano.', 20, {
    sourcePriceText: '50 - 35 - 40',
    notes: 'El documento original muestra 50 - 35 - 40 sin asociar explícitamente cada precio con CH/M/G. Revisar antes de publicar desde el catálogo dinámico.',
  }),
  base('cappuccino', 'Cappuccino', 'bebidas', 35, 'Cappuccino.', 30, {
    sizes: [
      { name: 'Chico', price: 35 },
      { name: 'Mediano', price: 40 },
      { name: 'Grande', price: 45 },
    ],
  }),
  base('latte', 'Latte', 'bebidas', 40, 'Café latte.', 40, {
    sizes: [
      { name: 'Chico', price: 40 },
      { name: 'Mediano', price: 45 },
      { name: 'Grande', price: 50 },
    ],
    extras: [
      { id: 'sabor', name: 'Con sabor', price: 10 },
      { id: 'baileys', name: 'Con Baileys', price: 15 },
    ],
  }),
  base('chai', 'Chai', 'bebidas', 45, 'Chai caliente.', 50, {
    sizes: [
      { name: 'Chico', price: 45 },
      { name: 'Mediano', price: 50 },
      { name: 'Grande', price: 55 },
    ],
  }),
  base('cafe-olla', 'Café de olla (soluble)', 'bebidas', 15, 'Café de olla soluble.', 60, {
    sizes: [
      { name: 'Chico', price: 15 },
      { name: 'Mediano', price: 25 },
      { name: 'Grande', price: 30 },
    ],
  }),
  base('chocolate', 'Chocolate', 'bebidas', 35, 'Chocolate caliente.', 70, {
    sizes: [
      { name: 'Chico', price: 35 },
      { name: 'Mediano', price: 40 },
      { name: 'Grande', price: 45 },
    ],
  }),
  base('chocolate-blanco', 'Chocolate blanco', 'bebidas', 35, 'Chocolate blanco caliente.', 80, {
    sizes: [
      { name: 'Chico', price: 35 },
      { name: 'Mediano', price: 40 },
      { name: 'Grande', price: 45 },
    ],
  }),
  base('mocca', 'Mocca', 'bebidas', 40, 'Café mocca.', 90, {
    sizes: [
      { name: 'Chico', price: 40 },
      { name: 'Mediano', price: 46 },
      { name: 'Grande', price: 50 },
    ],
  }),
  base('te', 'Té', 'bebidas', 20, 'Té caliente.', 100, {
    sizes: [
      { name: 'Chico', price: 20 },
      { name: 'Mediano', price: 25 },
      { name: 'Grande', price: 30 },
    ],
  }),
  base('ice-coffee', 'Ice coffee', 'bebidas', 50, 'Café frío.', 110),
  base('ice-coffee-leche', 'Ice coffee con leche', 'bebidas', 60, 'Café frío con leche.', 120),
  base('naranjada-mineral', 'Naranjada mineral', 'bebidas', 55, 'Naranjada con agua mineral.', 130),
  base('limonada-mineral', 'Limonada mineral', 'bebidas', 55, 'Limonada con agua mineral.', 140),
  base('te-frio', 'Té frío', 'bebidas', 30, 'Té frío.', 150),
  base('frappe-mocca', 'Frappé Mocca', 'bebidas', null, 'Frappé sabor Mocca.', 160, {
    notes: 'El documento original enumera los sabores de frappé pero no muestra precio.',
  }),
  base('frappe-chocolate', 'Frappé Chocolate', 'bebidas', null, 'Frappé sabor Chocolate.', 170, {
    notes: 'El documento original enumera los sabores de frappé pero no muestra precio.',
  }),
  base('frappe-chocolate-blanco', 'Frappé Chocolate Blanco', 'bebidas', null, 'Frappé sabor Chocolate Blanco.', 180, {
    notes: 'El documento original enumera los sabores de frappé pero no muestra precio.',
  }),
  base('frappe-cookies-cream', 'Frappé Cookies & Cream', 'bebidas', null, 'Frappé sabor Cookies & Cream.', 190, {
    notes: 'El documento original enumera los sabores de frappé pero no muestra precio.',
  }),
  base('frappuccino', 'Frappuccino', 'bebidas', null, 'Frappuccino.', 200, {
    notes: 'El documento original enumera los sabores de frappé pero no muestra precio.',
  }),
  base('refresco', 'Refresco', 'bebidas', 25, 'Refresco.', 210),
  base('agua-botella-05', 'Botella de agua 1/2 litro', 'bebidas', 10, 'Botella de agua de 1/2 litro.', 220),
  base('agua-botella-1', 'Botella de agua 1 litro', 'bebidas', 14, 'Botella de agua de 1 litro.', 230),
  base('agua-botella-15', 'Botella de agua 1.5 litros', 'bebidas', 18, 'Botella de agua de 1.5 litros.', 240),

  base('licuado-1-fruta', 'Licuado de 1 ingrediente', 'licuados-agua-fruta-jugos', 40, 'Elige una fruta o ingrediente.', 300, {
    sizes: [
      { name: '1/2 litro', price: 40 },
      { name: '1 litro', price: 75 },
    ],
    options: ['Fresa', 'Manzana', 'Plátano', 'Papaya', 'Mamey', 'Melón', 'Chocolate', 'Mango', 'Fruta de temporada'],
    extras: [
      { id: 'extra-fruta-semillas', name: 'Extra fruta o semillas', price: 5 },
      { id: 'nuez-almendra', name: 'Nuez y almendra', price: 10 },
    ],
  }),
  base('licuado-combinado', 'Licuado combinado de 2 frutas', 'licuados-agua-fruta-jugos', 45, 'Combina dos frutas.', 310, {
    sizes: [
      { name: '1/2 litro', price: 45 },
      { name: '1 litro', price: 85 },
    ],
    extras: [
      { id: 'extra-fruta-semillas', name: 'Extra fruta o semillas', price: 5 },
      { id: 'nuez-almendra', name: 'Nuez y almendra', price: 10 },
    ],
  }),
  base('agua-fresca', 'Agua fresca', 'licuados-agua-fruta-jugos', 30, 'Agua fresca.', 320, {
    sizes: [
      { name: '1/2 litro', price: 30 },
      { name: '1 litro', price: 55 },
    ],
  }),
  base('cocktail-frutas', 'Cocktail de frutas', 'licuados-agua-fruta-jugos', 50, 'Servido con miel y granola o miel y crema batida.', 330, {
    options: ['Miel y granola', 'Miel y crema batida'],
    extras: [
      { id: 'amaranto', name: 'Amaranto', price: 5 },
      { id: 'nuez-almendras', name: 'Nuez o almendras', price: 10 },
    ],
  }),
  base('jugo-natural', 'Jugo natural', 'licuados-agua-fruta-jugos', 40, 'Naranja o zanahoria.', 340, {
    sizes: [
      { name: '1/2 litro', price: 40 },
      { name: '1 litro', price: 75 },
    ],
    options: ['Naranja', 'Zanahoria'],
  }),
  base('jugo-combinado', 'Jugo combinado / especial', 'licuados-agua-fruta-jugos', 45, 'Verde, antigripal o combinado.', 350, {
    sizes: [
      { name: '1/2 litro', price: 45 },
      { name: '1 litro', price: 85 },
    ],
    options: ['Verde', 'Antigripal', 'Combinado'],
  }),

  base('pan-dulce', 'Pan dulce', 'panaderia', 20, 'Pieza de pan dulce.', 400),
  base('muffin', 'Muffin', 'panaderia', 25, 'Muffin.', 410),
  base('hot-cakes', 'Hot cakes (3 pz) con 1 fruta', 'panaderia', 50, 'Elige con miel, lechera o mermelada de fresa.', 420, {
    options: ['Miel', 'Lechera', 'Mermelada de fresa'],
    extras: [{ id: 'nutella', name: 'Nutella', price: 10 }],
  }),
  base('pastel-temporada', 'Pastel de temporada', 'panaderia', 40, 'Pastel de temporada.', 430),

  base('molletes', 'Molletes', 'molletes-sincronizadas-tortas', 60, 'Frijoles y queso manchego, acompañados de pico de gallo.', 500, {
    extras: [
      { id: 'jamon', name: 'Jamón', price: 15 },
      { id: 'chorizo', name: 'Chorizo', price: 15 },
      { id: 'tocino', name: 'Tocino', price: 15 },
    ],
  }),
  base('sincronizadas', 'Sincronizadas', 'molletes-sincronizadas-tortas', 50, '6 piezas con jamón de pierna, queso manchego, frijoles y jitomate.', 510),
  base('tortas', 'Tortas', 'molletes-sincronizadas-tortas', 75, 'Preparadas con frijoles refritos, queso, jitomate, aguacate y lechuga. Acompañadas de papas a la francesa.', 520, {
    options: ['Pollo', 'Bistec', 'Jamón', 'Huevo', 'Salchicha'],
  }),
  base('papas-francesa', 'Papas a la francesa', 'molletes-sincronizadas-tortas', 60, 'Orden de papas a la francesa.', 530, {
    extras: [
      { id: 'tocino', name: 'Tocino', price: 20 },
      { id: 'queso', name: 'Queso', price: 20 },
    ],
  }),
  base('totopos', 'Orden de totopos', 'molletes-sincronizadas-tortas', 20, 'Orden de totopos.', 540),

  base('paquete-desayuno', 'Haz cualquier platillo paquete', 'desayunos', 20, 'Agrega jugo o fruta y café de olla o té.', 600, {
    sourcePriceText: '+$20',
    includedItems: ['Jugo o fruta', 'Café de olla o té'],
  }),
  base('huevos-gusto', 'Huevos al gusto', 'desayunos', 70, 'Se acompañan con frijoles refritos y totopos.', 610, {
    options: ['Jamón', 'Champiñones', 'Queso', 'Tocino', 'Salchicha', 'A la mexicana', 'Chorizo', 'Rancheros', 'Divorciados'],
  }),
  base('huevos-albanil', 'Huevos al albañil', 'desayunos', 80, 'Huevos revueltos bañados en salsa verde con bistec y nopales, acompañados de frijoles refritos.', 620),
  base('omelette-espinacas', 'Omelette de espinacas', 'desayunos', 70, 'Acompañado de una porción de ensalada.', 630),
  base('omelette-gratin', 'Omelette al gratín', 'desayunos', 80, 'Huevo en torta relleno de jamón con queso Oaxaca, acompañado de papas a la francesa y 2 hot cakes con miel maple.', 640),
  base('enfrijoladas', 'Enfrijoladas', 'desayunos', 80, '4 tortillas de maíz bañadas en salsa de frijol. Se agrega crema, queso rallado y chorizo.', 650, {
    options: ['Pollo', 'Huevo a la mexicana', 'Queso'],
  }),
  base('chilaquiles', 'Chilaquiles', 'desayunos', 80, 'Totopos bañados en salsa roja o verde, crema, cebolla, queso fresco y frijoles refritos.', 660, {
    options: ['Con huevo', 'Con pollo', 'Con bistec'],
  }),
  base('chilaquiles-arrachera', 'Chilaquiles con arrachera', 'desayunos', 90, 'Chilaquiles con arrachera.', 670),

  base('chapata-pierna', 'Chapata de pierna', 'chapatas-sandwiches', 70, 'Jamón de pierna, queso manchego, tocino y aderezo de chipotle.', 700),
  base('chapata-pollo', 'Chapata de pollo', 'chapatas-sandwiches', 80, 'Pechuga de pollo asada o empanizada, queso panela y aderezo de chipotle.', 710),
  base('chapata-quesos', 'Chapata de quesos', 'chapatas-sandwiches', 65, 'Queso manchego, queso panela, champiñones y aderezo de chipotle.', 720),
  base('chapata-bistec', 'Chapata de bistec', 'chapatas-sandwiches', 80, 'Bistec a la plancha gratinado con queso manchego.', 730),
  base('club-sandwich', 'Club sandwich', 'chapatas-sandwiches', 80, 'Pan de caja, jamón de pierna, pollo, queso manchego, tocino, mayonesa y jitomate.', 740),
  base('sandwiches', 'Sandwiches', 'chapatas-sandwiches', 60, 'Pan de caja con mayonesa.', 750, {
    options: ['Pollo', 'Salchicha', 'Jamón', 'Huevo'],
  }),

  base('hamburguesa-sencilla', 'Hamburguesa sencilla', 'hamburguesas', 60, 'Carne con queso amarillo, jamón y mayonesa.', 800),
  base('hamburguesa-pina-champ', 'Hamburguesa con piña o champiñones', 'hamburguesas', 80, 'Hamburguesa con piña o champiñones.', 810, {
    options: ['Piña', 'Champiñones'],
  }),
  base('paquete-hamburguesa', 'Hazla paquete', 'hamburguesas', 35, 'Complemento para hamburguesa.', 820, {
    sourcePriceText: '+$35',
    includedItems: ['Papas a la francesa', 'Refresco'],
  }),

  base('comida-corrida', 'Comida corrida', 'comida-corrida', 90, 'Menú de tres tiempos.', 900, {
    includedItems: ['1er tiempo: consomé o sopa del día', '2do tiempo: arroz o pasta', '3er tiempo: guisado del día', '1/2 litro de agua natural del día', 'Postre'],
    options: ['Enchiladas verdes o rojas', 'Milanesa de res o pollo', 'Tacos dorados'],
    extras: [
      { id: 'bistec-pechuga-asada', name: 'Cambiar tercer tiempo por bistec o pechuga asada', price: 5 },
      { id: 'enchiladas-suizas', name: 'Cambiar tercer tiempo por enchiladas suizas', price: 10 },
      { id: 'huevo', name: 'Agregar huevo', price: 10 },
      { id: 'platano', name: 'Agregar plátano', price: 10 },
    ],
  }),

  base('tacos-2', 'Orden de 2 tacos', 'antojitos', 55, 'Se acompañan con nopales o papas a la francesa.', 1000, {
    options: ['Bistec', 'Pechuga de pollo asada', 'Pechuga de pollo empanizada', 'Chorizo con papas', 'Milanesa de res'],
    extras: [{ id: 'queso', name: 'Queso', price: 10 }],
  }),
  base('tacos-arrachera', 'Orden de 2 tacos de arrachera', 'antojitos', 70, 'Se acompañan con nopales o papas a la francesa.', 1010, {
    extras: [{ id: 'queso', name: 'Queso', price: 10 }],
  }),
  base('burrito-sencillo', 'Burrito sencillo', 'antojitos', 75, 'Tortilla de harina, frijoles refritos y queso. Se acompaña con papas a la francesa.', 1020, {
    options: ['Jamón', 'Huevo', 'Chorizo', 'Pollo', 'Bistec'],
  }),
  base('burrito-especial', 'Burrito especial', 'antojitos', 90, 'Tortilla de harina, frijoles refritos y queso. Se acompaña con papas a la francesa.', 1030, {
    options: ['Arrachera', 'Campechano'],
  }),

  base('paquete-especialidad', 'Haz cualquier especialidad paquete', 'especialidades', 20, 'Agrega sopa o arroz y agua fresca.', 1100, {
    sourcePriceText: '+$20',
    includedItems: ['Sopa o arroz', 'Agua fresca'],
  }),
  base('extra-arroz', 'Extra arroz con plátano o huevo', 'especialidades', 10, 'Extra para especialidades.', 1110, {
    options: ['Plátano', 'Huevo'],
  }),
  base('enchiladas-mole', 'Enchiladas de mole', 'especialidades', 90, '4 piezas con pollo deshebrado y guarnición de frijoles refritos.', 1120),
  base('milanesa-gratin', 'Milanesa de res o pollo al gratín', 'especialidades', 90, 'Gratinada con queso manchego, aderezo de chipotle y porción de ensalada.', 1130, {
    options: ['Res', 'Pollo'],
  }),
  base('spaghetti-alfredo', 'Spaghetti Alfredo', 'especialidades', 90, 'Pasta con salsa de crema, champiñones, pechuga asada y queso manchego.', 1140),
  base('cordon-blue', 'Pechuga Cordon Blue', 'especialidades', 90, 'Pechuga empanizada rellena de jamón de pierna y queso, acompañada de papas y frijoles refritos.', 1150),
  base('alambre', 'Alambre de res o pollo', 'especialidades', 90, 'Tocino, pimiento morrón, cebolla y queso Oaxaca, acompañado de frijoles y tortillas.', 1160, {
    options: ['Res', 'Pollo'],
  }),

  base('ensalada', 'Arma tu ensalada', 'ensaladas', 90, 'Base de lechuga italiana, pasta, pepino, jitomate y zanahoria. Elige una opción por columna.', 1200, {
    includedItems: ['1 proteína', '1 fruta', '1 topping', '1 aderezo'],
    options: [
      'Proteína: pechuga asada', 'Proteína: pechuga empanizada', 'Proteína: jamón de pierna', 'Proteína: huevo duro', 'Proteína: bistec',
      'Fruta: manzana', 'Fruta: mango', 'Fruta: fresa', 'Fruta: aguacate', 'Fruta: naranja',
      'Topping: queso panela', 'Topping: nuez', 'Topping: queso rallado', 'Topping: crutones', 'Topping: tortilla frita',
      'Aderezo: chipotle', 'Aderezo: mil islas', 'Aderezo: ranch',
    ],
  }),

  base('pozole-sabado', 'Pozole', 'fin-de-semana', 80, 'Pozole rojo de pollo; elige carne de cerdo o pechuga desmenuzada. Acompañado de lechuga, rábanos, crema y 3 tostadas.', 1300, {
    weekendOnly: 'Sábados',
    options: ['Carne de cerdo', 'Pechuga desmenuzada'],
    includedItems: ['1/2 litro de agua fresca natural o café de olla chico'],
  }),
  base('pancita-domingo', 'Pancita', 'fin-de-semana', 80, 'Pancita de res acompañada de tortillas de maíz, cebolla y cilantro.', 1310, {
    weekendOnly: 'Domingos',
    includedItems: ['1/2 litro de agua fresca natural o café de olla chico'],
  }),
];
