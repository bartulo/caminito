var Edge = {
  NONE: 0,
  TOP: 1,
  LEFT: 2,
  BOTTOM: 4,
  RIGHT: 8
};

var terrainVert = function() {
  return `
  uniform vec3 uGlobalOffset;
  uniform sampler2D uHeightData;
  uniform vec2 uTileOffset;
  uniform float uScale;
  uniform int uEdgeMorph;

  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vMorphFactor;

  #define TILE_RESOLUTION 250.
  #define EDGE_MORPH_TOP 1
  #define EDGE_MORPH_LEFT 2
  #define EDGE_MORPH_BOTTOM 4
  #define EDGE_MORPH_RIGHT 8

  float getHeight(vec3 p) {
    float lod = 0.0;
    vec2 st = vec2( vPosition.x + 2000., vPosition.y + 2000.) / 4000.;

    vec3 h = texture2DLod(uHeightData, st, lod).rgb;
    return ( ( h.x * 255.) + h.y ) * 255. ;
  }

  bool edgePresent(int edge) {
    int e = uEdgeMorph / edge;
    return 2 * ( e / 2 ) != e;
  }

  #define MORPH_REGION 0.3

  float calculateMorph(vec3 p) {
    float morphFactor = 0.0;
    if( edgePresent(EDGE_MORPH_TOP) && p.y >= 1.0 - MORPH_REGION ) {
      float m = 1.0 - clamp((1.0 - p.y) / MORPH_REGION, 0.0, 1.0);
      morphFactor = max(m, morphFactor);
    }
    if( edgePresent(EDGE_MORPH_LEFT) && p.x <= MORPH_REGION ) {
      float m = 1.0 - clamp(p.x / MORPH_REGION, 0.0, 1.0);
      morphFactor = max(m, morphFactor);
    }
    if( edgePresent(EDGE_MORPH_BOTTOM) && p.y <= MORPH_REGION ) {
      float m = 1.0 - clamp(p.y / MORPH_REGION, 0.0, 1.0);
      morphFactor = max(m, morphFactor);
    }
    if( edgePresent(EDGE_MORPH_RIGHT) && p.x >= 1.0 - MORPH_REGION ) {
      float m = 1.0 - clamp((1.0 - p.x) / MORPH_REGION, 0.0, 1.0);
      morphFactor = max(m, morphFactor);
    }

    return morphFactor;
  }

  void main() {
    vMorphFactor = calculateMorph(position);

    vPosition = uScale * position + vec3( uTileOffset, 0.0 ) + vec3( uGlobalOffset.xy, 0.0 );

    float grid = uScale / TILE_RESOLUTION;
    vPosition = floor(vPosition / grid) * grid;

    if( vMorphFactor > 0.0 ) {
      grid = 2.0 * grid;
      vec3 position2 = floor(vPosition / grid) * grid;

      vPosition = mix(vPosition, position2, vMorphFactor);
    }

    vPosition = vec3(vPosition.xy, getHeight(vPosition)) ;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(vPosition, 1.0);
  }

  `
}

var terrainFrag = function() {
  return `
  uniform float uScale;
  uniform sampler2D uPnoa;

  varying vec3 vPosition;

  void main() {
    vec2 st = vec2( vPosition.x + 2000., vPosition.y + 2000.) / 4000.;
    vec3 h = texture2D( uPnoa, st ).xyz;

    vec2 alpha = step( vec2( -2000. ), -vPosition.xy );
    vec2 alpha2 = step( vec2( -2000. ), vPosition.xy );

    gl_FragColor = vec4( h, alpha.x * alpha.y * alpha2.x * alpha2.y );
  }
  `
}

var Terrain = function( heightData, worldWidth, levels, resolution, text )  {
  THREE.Object3D.call( this );

  this.worldWidth = ( worldWidth !== undefined ) ? worldWidth : 1024 ;
  this.levels = ( levels !== undefined ) ? levels : 6;
  this.resolution = ( resolution !== undefined ) ? resolution : 128;
  this.heightData = heightData;
  this.text = text;

  this.offset = new THREE.Vector3( 0, 0, 0 );

  // Gestionar los shaders

  this.tileGeometry = new THREE.PlaneGeometry( 1, 1, this.resolution, this.resolution );
  
  // colocar el centro en la esquina inferior izquierda 

  var m = new THREE.Matrix4();
  m.makeTranslation( 0.5, 0.5, 0 );
  this.tileGeometry.applyMatrix( m );

  // Establecer la escala inicial en función del tamaño total y el número de niveles

  var initialScale = this.worldWidth / Math.pow( 2, levels );

  // Se crean las cuatro teselas centrales 

  this.createTile( -initialScale, -initialScale, initialScale, Edge.NONE );
  this.createTile( -initialScale, 0, initialScale, Edge.NONE );
  this.createTile( 0, 0, initialScale, Edge.NONE );
  this.createTile( 0, -initialScale, initialScale, Edge.NONE );

  // Y ahora las 12 teselas que rodean para cada uno de los niveles

  for ( var scale = initialScale; scale < this.worldWidth; scale *= 2 ) {
    this.createTile( -2 * scale, -2 * scale, scale, Edge.BOTTOM | Edge.LEFT );
    this.createTile( -2 * scale, -scale, scale, Edge.LEFT );
    this.createTile( -2 * scale, 0, scale, Edge.LEFT );
    this.createTile( -2 * scale, scale, scale, Edge.TOP | Edge.LEFT );

    this.createTile( -scale, -2 * scale, scale, Edge.BOTTOM );
    this.createTile( -scale, scale, scale, Edge.TOP );

    this.createTile( 0, -2 * scale, scale, Edge.BOTTOM );
    this.createTile( 0, scale, scale, Edge.TOP );

    this.createTile( scale, -2 * scale, scale, Edge.BOTTOM | Edge.RIGHT );
    this.createTile( scale, -scale, scale, Edge.RIGHT );
    this.createTile( scale, 0, scale, Edge.RIGHT );
    this.createTile( scale, scale, scale, Edge.TOP | Edge.RIGHT );
  }
};

Terrain.prototype = Object.create( THREE.Object3D.prototype );

Terrain.prototype.createTile = function( x, y, scale, edgeMorph ) {
  var terrainMaterial = this.createTerrainMaterial( this.heightData, this.offset, new THREE.Vector2( x, y ), scale, this.resolution, edgeMorph, this.text );
  console.log( terrainMaterial );
  var plane = new THREE.Mesh( this.tileGeometry, terrainMaterial );
  this.add( plane );
};

Terrain.prototype.createTerrainMaterial = function( heightData, globalOffset, offset, scale, resolution, edgeMorph, text ) {
  var texture = new THREE.TextureLoader().load( 'images/final_hillshade.jpg' )
  return new THREE.ShaderMaterial( {
    uniforms: {
      uEdgeMorph: { type: "i", value: edgeMorph },
      uGlobalOffset: { type: "v3", value: globalOffset },
      uHeightData: { type: "t", value: heightData },
      uPnoa: { type: "t", value: text},
      uTileOffset: { type: "v2", value: offset },
      uScale: { type: "f", value: scale }
    },
    vertexShader: terrainVert(),
    fragmentShader: terrainFrag(),
    transparent: true
  } );
}

