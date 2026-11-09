"! Vendor creation for Jones Vendor Onboarding, wrapping the standard vendor API VMD_EI_API.
"! Idempotent on the request id (table ZVOB_REQLOG). Test run = no commit.
"! Every name marked VERIFY IN DEV must be checked in SE24/SE11 on the Jones DEV system.
CLASS zcl_vob_vendor_service DEFINITION PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_message,
             type   TYPE bapi_mtype,
             id     TYPE symsgid,
             number TYPE symsgno,
             text   TYPE string,
             field  TYPE string,
           END OF ty_message,
           tt_messages TYPE STANDARD TABLE OF ty_message WITH DEFAULT KEY,
           BEGIN OF ty_result,
             result        TYPE string,     " SIMULATED, CREATED, ALREADY_CREATED, ERROR
             vendor_number TYPE lifnr,
             has_errors    TYPE abap_bool,
             messages      TYPE tt_messages,
           END OF ty_result,
           BEGIN OF ty_ping,
             ok      TYPE abap_bool,
             system  TYPE sysysid,
             client  TYPE symandt,
             release TYPE string,
             user    TYPE syuname,
           END OF ty_ping,
           BEGIN OF ty_match,
             vendor_number TYPE lifnr,
             name          TYPE name1_gp,
             city          TYPE ort01_gp,
             matched_on    TYPE string_table,
             blocked       TYPE abap_bool,
           END OF ty_match,
           BEGIN OF ty_duplicates,
             matches TYPE STANDARD TABLE OF ty_match WITH DEFAULT KEY,
           END OF ty_duplicates.

    METHODS ping RETURNING VALUE(rs_ping) TYPE ty_ping.
    METHODS duplicates IMPORTING iv_json TYPE string RETURNING VALUE(rs_dup) TYPE ty_duplicates.
    METHODS create_vendor IMPORTING iv_json TYPE string RETURNING VALUE(rs_result) TYPE ty_result.
    METHODS read_vendor IMPORTING iv_lifnr TYPE lifnr RETURNING VALUE(rs_result) TYPE ty_result.
    METHODS add_attachment IMPORTING iv_lifnr TYPE lifnr iv_json TYPE string RETURNING VALUE(rs_result) TYPE ty_result.

  PRIVATE SECTION.
    " Shape of the JSON body sent by the CAP app (srv/lib/sap/mapping.js)
    TYPES: BEGIN OF ty_payload,
             request_id    TYPE char20,
             test_run      TYPE abap_bool,
             company_code  TYPE bukrs,
             account_group TYPE ktokk,
             BEGIN OF central,
               name1 TYPE name1_gp, name2 TYPE name2_gp, name3 TYPE name3_gp, name4 TYPE name4_gp,
               search_term TYPE sortl, country TYPE land1, language TYPE spras,
               street TYPE ad_street, district TYPE ad_city2, city TYPE ad_city1, post_code TYPE ad_pstcd1,
               phone TYPE ad_tlnmbr1, email TYPE ad_smtpadr, vat_number TYPE stceg, company_reg_no TYPE stcd1,
             END OF central,
             BEGIN OF contacts,
               accounts_clerk TYPE dzsabe, accounts_email TYPE intad, sales_person TYPE everk, sales_email TYPE ad_smtpadr,
             END OF contacts,
             BEGIN OF bank,
               country TYPE banks, bank_key TYPE bankk, bank_account TYPE bankn, iban TYPE iban, swift TYPE swift,
               bank_name TYPE banka, bank_address TYPE stras_gp, account_holder TYPE koinh_fi, create_missing_bank TYPE abap_bool,
             END OF bank,
             BEGIN OF company_data,
               company_code TYPE bukrs, recon_account TYPE akont, payment_terms TYPE dzterm, payment_methods TYPE dzwels,
             END OF company_data,
             BEGIN OF purchasing,
               purchasing_org TYPE ekorg, currency TYPE waers, payment_terms TYPE dzterm,
               gr_based_invoice_verification TYPE abap_bool, sales_person TYPE everk, phone TYPE telf1,
             END OF purchasing,
           END OF ty_payload.

    METHODS map_to_vmds
      IMPORTING is_p           TYPE ty_payload
      RETURNING VALUE(rs_main) TYPE vmds_ei_main.
    METHODS ensure_bank
      IMPORTING is_p        TYPE ty_payload
      CHANGING  ct_messages TYPE tt_messages.
ENDCLASS.

CLASS zcl_vob_vendor_service IMPLEMENTATION.

  METHOD ping.
    rs_ping = VALUE #( ok = abap_true system = sy-sysid client = sy-mandt release = sy-saprl user = sy-uname ).
  ENDMETHOD.

  METHOD duplicates.
    DATA ls_q TYPE ty_payload-central.
    DATA lv_iban TYPE iban.
    /ui2/cl_json=>deserialize( EXPORTING json = iv_json pretty_name = /ui2/cl_json=>pretty_mode-camel_case CHANGING data = ls_q ).
    " VERIFY IN DEV: field names in the query JSON are vatNumber / iban / name / postCode (flat), see srv/lib/sap/http.js
    IF ls_q-vat_number IS NOT INITIAL.
      SELECT lifnr, name1, ort01 FROM lfa1 WHERE stceg = @ls_q-vat_number AND loevm = @abap_false INTO TABLE @DATA(lt_vat) UP TO 20 ROWS.
      LOOP AT lt_vat INTO DATA(ls_v).
        APPEND VALUE #( vendor_number = ls_v-lifnr name = ls_v-name1 city = ls_v-ort01 matched_on = VALUE #( ( `VAT` ) ) blocked = abap_true ) TO rs_dup-matches.
      ENDLOOP.
    ENDIF.
    " IBAN: TIBAN holds IBAN per bank country/key/account; LFBK links the vendor. VERIFY IN DEV
  ENDMETHOD.

  METHOD create_vendor.
    DATA ls_p TYPE ty_payload.
    /ui2/cl_json=>deserialize( EXPORTING json = iv_json pretty_name = /ui2/cl_json=>pretty_mode-camel_case CHANGING data = ls_p ).

    " Idempotency: one vendor per request id, ever.
    SELECT SINGLE lifnr FROM zvob_reqlog WHERE request_id = @ls_p-request_id AND status = 'CREATED' INTO @DATA(lv_existing).
    IF sy-subrc = 0 AND ls_p-test_run = abap_false.
      rs_result = VALUE #( result = 'ALREADY_CREATED' vendor_number = lv_existing
                           messages = VALUE #( ( type = 'S' text = |Vendor { lv_existing } already exists for { ls_p-request_id }| ) ) ).
      RETURN.
    ENDIF.

    ensure_bank( EXPORTING is_p = ls_p CHANGING ct_messages = rs_result-messages ).
    IF line_exists( rs_result-messages[ type = 'E' ] ).
      rs_result-has_errors = abap_true.
      rs_result-result = 'ERROR'.
      RETURN.
    ENDIF.

    DATA(ls_main) = map_to_vmds( ls_p ).
    DATA: ls_correct TYPE vmds_ei_main,
          ls_mes     TYPE cvis_message,
          ls_mes_err TYPE cvis_message.

    vmd_ei_api=>initialize( ).                                  " VERIFY IN DEV
    vmd_ei_api=>maintain_bapi(                                  " VERIFY IN DEV: parameter names
      EXPORTING iv_test_run         = ls_p-test_run
                iv_collect_messages = abap_true
                is_master_data      = ls_main
      IMPORTING es_master_data_correct = ls_correct
                es_message_correct     = ls_mes
                es_master_data_defective = DATA(ls_defective)
                es_message_defective   = ls_mes_err ).

    LOOP AT ls_mes_err-messages INTO DATA(ls_m).
      APPEND VALUE #( type = ls_m-type id = ls_m-id number = ls_m-number text = ls_m-message ) TO rs_result-messages.
    ENDLOOP.
    LOOP AT ls_mes-messages INTO ls_m.
      APPEND VALUE #( type = ls_m-type id = ls_m-id number = ls_m-number text = ls_m-message ) TO rs_result-messages.
    ENDLOOP.

    IF ls_mes_err-is_error = abap_true OR line_exists( rs_result-messages[ type = 'E' ] ).
      ROLLBACK WORK.
      rs_result-has_errors = abap_true.
      rs_result-result = 'ERROR'.
      RETURN.
    ENDIF.

    IF ls_p-test_run = abap_true.
      ROLLBACK WORK.
      rs_result-result = 'SIMULATED'.
      APPEND VALUE #( type = 'S' text = 'Test run: no errors found. Nothing was saved.' ) TO rs_result-messages.
      RETURN.
    ENDIF.

    COMMIT WORK AND WAIT.
    READ TABLE ls_correct-vendors INTO DATA(ls_vendor) INDEX 1.   " VERIFY IN DEV: header-object_instance-lifnr
    rs_result-vendor_number = ls_vendor-header-object_instance-lifnr.
    rs_result-result = 'CREATED'.
    INSERT zvob_reqlog FROM @( VALUE #( request_id = ls_p-request_id lifnr = rs_result-vendor_number status = 'CREATED'
                                         created_by = sy-uname created_on = sy-datum created_at = sy-uzeit ) ).
    COMMIT WORK.
  ENDMETHOD.

  METHOD map_to_vmds.
    " VERIFY IN DEV: every structure/field below against VMDS_EI_MAIN in SE11 (ECC 6.0 EHP8, SAP_APPL 618).
    DATA ls_vendor TYPE vmds_ei_extern.
    ls_vendor-header-object_task = 'I'.
    ls_vendor-central_data-central-data-ktokk = is_p-account_group.
    ls_vendor-central_data-central-data-sortl = is_p-central-search_term.
    ls_vendor-central_data-central-data-stceg = is_p-central-vat_number.
    ls_vendor-central_data-central-data-stcd1 = is_p-central-company_reg_no.
    ls_vendor-central_data-central-datax-ktokk = abap_true.
    ls_vendor-central_data-central-datax-sortl = abap_true.
    ls_vendor-central_data-central-datax-stceg = abap_true.
    ls_vendor-central_data-central-datax-stcd1 = abap_true.

    ls_vendor-central_data-address-postal-data = VALUE #(
      name = is_p-central-name1 name_2 = is_p-central-name2 name_3 = is_p-central-name3 name_4 = is_p-central-name4
      street = is_p-central-street district = is_p-central-district city = is_p-central-city
      postl_cod1 = is_p-central-post_code country = is_p-central-country langu = 'E' sort1 = is_p-central-search_term ).
    ls_vendor-central_data-address-postal-datax = VALUE #(
      name = abap_true name_2 = abap_true name_3 = abap_true name_4 = abap_true street = abap_true district = abap_true
      city = abap_true postl_cod1 = abap_true country = abap_true langu = abap_true sort1 = abap_true ).

    " Bank: VERIFY IN DEV structure CVIS_EI_BANKDETAIL / IBAN field name
    APPEND VALUE #( task = 'I'
                    data_key = VALUE #( banks = is_p-bank-country bankl = is_p-bank-bank_key bankn = is_p-bank-bank_account )
                    data = VALUE #( koinh = is_p-bank-account_holder iban = is_p-bank-iban swift = is_p-bank-swift )
                    datax = VALUE #( koinh = abap_true iban = abap_true swift = abap_true ) )
      TO ls_vendor-central_data-bankdetail-bankdetails.

    " Company code data
    APPEND VALUE #( task = 'I'
                    data_key = VALUE #( bukrs = is_p-company_code )
                    data = VALUE #( akont = is_p-company_data-recon_account zterm = is_p-company_data-payment_terms
                                    zwels = is_p-company_data-payment_methods zsabe = is_p-contacts-accounts_clerk intad = is_p-contacts-accounts_email )
                    datax = VALUE #( akont = abap_true zterm = abap_true zwels = abap_true zsabe = abap_true intad = abap_true ) )
      TO ls_vendor-company_data-company.

    " Purchasing data
    APPEND VALUE #( task = 'I'
                    data_key = VALUE #( ekorg = is_p-purchasing-purchasing_org )
                    data = VALUE #( waers = is_p-purchasing-currency zterm = is_p-purchasing-payment_terms
                                    webre = is_p-purchasing-gr_based_invoice_verification verkf = is_p-purchasing-sales_person telf1 = is_p-purchasing-phone )
                    datax = VALUE #( waers = abap_true zterm = abap_true webre = abap_true verkf = abap_true telf1 = abap_true ) )
      TO ls_vendor-purchasing_data-purchasing.

    " Withholding tax (RCT / CIS): VERIFY IN DEV structure VMDS_EI_WTAX_TYPE under company data

    APPEND ls_vendor TO rs_main-vendors.
  ENDMETHOD.

  METHOD ensure_bank.
    SELECT SINGLE bankl FROM bnka WHERE banks = @is_p-bank-country AND bankl = @is_p-bank-bank_key INTO @DATA(lv_bankl).
    IF sy-subrc = 0.
      RETURN.
    ENDIF.
    IF is_p-bank-create_missing_bank = abap_false.
      APPEND VALUE #( type = 'E' id = 'AR' number = '191'
                      text = |Bank key { is_p-bank-bank_key } does not exist for country { is_p-bank-country } (BNKA)| field = 'bank.bankKey' ) TO ct_messages.
      RETURN.
    ENDIF.
    DATA: ls_addr   TYPE bapi1011_address,
          ls_return TYPE bapiret2.
    ls_addr = VALUE #( bank_name = is_p-bank-bank_name street = is_p-bank-bank_address swift_code = is_p-bank-swift ).
    CALL FUNCTION 'BAPI_BANK_CREATE'
      EXPORTING bank_ctry = is_p-bank-country bank_key = is_p-bank-bank_key bank_address = ls_addr
                i_xupdate = COND #( WHEN is_p-test_run = abap_true THEN abap_false ELSE abap_true )   " VERIFY IN DEV
      IMPORTING return = ls_return.
    IF ls_return-type CA 'EA'.
      APPEND VALUE #( type = 'E' id = ls_return-id number = ls_return-number text = ls_return-message ) TO ct_messages.
    ENDIF.
  ENDMETHOD.

  METHOD read_vendor.
    SELECT SINGLE lifnr FROM lfa1 WHERE lifnr = @iv_lifnr INTO @rs_result-vendor_number.
    rs_result-result = COND #( WHEN sy-subrc = 0 THEN 'FOUND' ELSE 'NOT_FOUND' ).
  ENDMETHOD.

  METHOD add_attachment.
    " GOS attachment on business object LFA1:
    " SO_FOLDER_ROOT_ID_GET + SO_DOCUMENT_INSERT_API1 + BINARY_RELATION_CREATE_COMMIT (relation ATTA).
    " Implement in DEV following SAP note-free standard pattern; kept as a stub so the API contract is testable.
    rs_result-result = 'NOT_IMPLEMENTED'.
    APPEND VALUE #( type = 'W' text = |Attachment for { iv_lifnr } not stored yet: GOS implementation pending (VERIFY IN DEV)| ) TO rs_result-messages.
  ENDMETHOD.

ENDCLASS.
