"! ZVOB REST API for Jones Vendor Onboarding (ICF node /sap/zvob/v1).
"! Contract: docs/01-solution-design.md section 9. ABAP 7.50 syntax only (ECC 6.0 EHP8).
"! Routes: GET /ping, POST /duplicates, POST /vendors, GET /vendors/{lifnr}, POST /vendors/{lifnr}/attachments
CLASS zcl_vob_rest_handler DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_http_extension.
  PRIVATE SECTION.
    METHODS reply
      IMPORTING io_server TYPE REF TO if_http_server
                iv_status TYPE i
                iv_json   TYPE string.
    METHODS to_json
      IMPORTING ig_data        TYPE any
      RETURNING VALUE(rv_json) TYPE string.
ENDCLASS.

CLASS zcl_vob_rest_handler IMPLEMENTATION.

  METHOD if_http_extension~handle_request.
    DATA: lv_path   TYPE string,
          lv_method TYPE string,
          lv_body   TYPE string,
          lt_parts  TYPE STANDARD TABLE OF string WITH DEFAULT KEY.

    lv_method = server->request->get_header_field( '~request_method' ).
    lv_path   = server->request->get_header_field( '~path_info' ).
    lv_body   = server->request->get_cdata( ).
    SPLIT lv_path AT '/' INTO TABLE lt_parts.
    DELETE lt_parts WHERE table_line IS INITIAL.

    DATA(lo_service) = NEW zcl_vob_vendor_service( ).

    TRY.
        IF lv_method = 'GET' AND lines( lt_parts ) = 1 AND lt_parts[ 1 ] = 'ping'.
          reply( io_server = server iv_status = 200 iv_json = to_json( lo_service->ping( ) ) ).

        ELSEIF lv_method = 'POST' AND lines( lt_parts ) = 1 AND lt_parts[ 1 ] = 'duplicates'.
          reply( io_server = server iv_status = 200 iv_json = to_json( lo_service->duplicates( lv_body ) ) ).

        ELSEIF lv_method = 'POST' AND lines( lt_parts ) = 1 AND lt_parts[ 1 ] = 'vendors'.
          DATA(ls_result) = lo_service->create_vendor( lv_body ).
          reply( io_server = server
                 iv_status = COND #( WHEN ls_result-has_errors = abap_true THEN 422 ELSE 200 )
                 iv_json   = to_json( ls_result ) ).

        ELSEIF lv_method = 'GET' AND lines( lt_parts ) = 2 AND lt_parts[ 1 ] = 'vendors'.
          reply( io_server = server iv_status = 200 iv_json = to_json( lo_service->read_vendor( CONV lifnr( lt_parts[ 2 ] ) ) ) ).

        ELSEIF lv_method = 'POST' AND lines( lt_parts ) = 3 AND lt_parts[ 1 ] = 'vendors' AND lt_parts[ 3 ] = 'attachments'.
          reply( io_server = server iv_status = 200 iv_json = to_json( lo_service->add_attachment( iv_lifnr = CONV lifnr( lt_parts[ 2 ] ) iv_json = lv_body ) ) ).

        ELSE.
          reply( io_server = server iv_status = 404 iv_json = '{"messages":[{"type":"E","text":"Unknown route"}]}' ).
        ENDIF.
      CATCH cx_root INTO DATA(lx).
        reply( io_server = server iv_status = 500 iv_json = |\{"messages":[\{"type":"E","text":"{ escape( val = lx->get_text( ) format = cl_abap_format=>e_json_string ) }"\}]\}| ).
    ENDTRY.
  ENDMETHOD.

  METHOD reply.
    io_server->response->set_status( code = iv_status reason = '' ).
    io_server->response->set_header_field( name = 'Content-Type' value = 'application/json; charset=utf-8' ).
    io_server->response->set_cdata( iv_json ).
  ENDMETHOD.

  METHOD to_json.
    " VERIFY IN DEV: /UI2/CL_JSON exists in this ECC release (UI2 add-on). Fallback: CALL TRANSFORMATION id with sXML JSON writer.
    rv_json = /ui2/cl_json=>serialize( data = ig_data pretty_name = /ui2/cl_json=>pretty_mode-camel_case ).
  ENDMETHOD.

ENDCLASS.
